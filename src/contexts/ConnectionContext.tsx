import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { AppState } from "react-native";
import type {
  ConnectionState,
  InternetStatus,
  DisconnectReason,
  UsageStats,
  WifiSession,
} from "../types";
import { useAuth } from "./AuthContext";
import {
  fetchQuotaStatus,
  requestWifiSession,
  adHeartbeat,
  endWifiSession,
  type ServerAllocation,
  type ServerSession,
  type QuotaStatusShape,
} from "../repositories/sessionRepository";
import {
  getAvailableCampaign,
  startAdView,
  completeAdView,
} from "../repositories/adRepository";
import type { AdCampaign } from "../types";
import { registerDevice } from "../repositories/deviceRepository";
import { resolveNetworkAdapter } from "../network";
import { getConfig } from "../lib/config";
import { uuidV4 } from "../lib/uuid";
import { logger } from "../lib/logger";
import {
  canTransition,
  getDisconnectReason,
  CONNECTION_ACTIONS as ACTIONS,
  STATE_LABELS,
  REASON_LABELS,
} from "../services/connectionMachine";

const TAG = "conn";

const HEARTBEAT_INTERVAL_MS = 10000;
const QUOTA_POLL_INTERVAL_MS = 8000;
const AUTHORIZE_TIMEOUT_MS = 15000;

export interface ConnectionContextValue {
  state: ConnectionState;
  internetStatus: InternetStatus;
  usage: UsageStats;
  stateLabel: string;
  disconnectReason: DisconnectReason | undefined;
  reasonLabel: string | undefined;
  activeSession: WifiSession | null;
  adProgress: number;
  networkHealth: string;
  currentAd: AdCampaign | null;
  lastSyncAt: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refillQuota: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

const ACTIVE_SERVER_STATUSES = new Set(["authorized", "active", "paused", "authorizing", "pending"]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function allocationToUsage(a?: ServerAllocation | null): UsageStats {
  const quotaBytes = a?.quota_bytes ?? 0;
  const remainingBytes = Math.max(0, (a?.remaining_bytes ?? quotaBytes));
  const consumedBytes = Math.max(0, quotaBytes - remainingBytes);
  return {
    remainingQuotaMB: Math.round(remainingBytes / (1024 * 1024)),
    totalQuotaMB: Math.round(quotaBytes / (1024 * 1024)),
    remainingTimeMinutes: 0,
    totalTimeMinutes: 0,
    todayConsumptionMB: Math.round(consumedBytes / (1024 * 1024)),
  };
}

export function serverSessionToWifi(s?: ServerSession | null): WifiSession | null {
  if (!s?.session_id) return null;
  return {
    id: s.session_id,
    status: (s.status as WifiSession["status"]) ?? "pending",
    startedAt: s.started_at ?? undefined,
    endedAt: s.ended_at ?? undefined,
    allocatedBytes: undefined,
    consumedBytes: s.bytes_total ?? 0,
    authorizationState: s.authorization_state ?? undefined,
    adState: s.ad_state ?? undefined,
    routerSessionReference: s.router_session_reference ?? undefined,
    heartbeatExpiresAt: s.heartbeat_expires_at ?? undefined,
    disconnectReason: s.disconnect_reason ?? undefined,
  };
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ConnectionState>("idle");
  const [internetStatus, setInternetStatus] = useState<InternetStatus>("cut");
  const [usage, setUsage] = useState<UsageStats>({
    remainingQuotaMB: 0,
    totalQuotaMB: 0,
    remainingTimeMinutes: 0,
    totalTimeMinutes: 0,
    todayConsumptionMB: 0,
  });
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason | undefined>();
  const [activeSession, setActiveSession] = useState<WifiSession | null>(null);
  const [adProgress, setAdProgress] = useState(0);
  const [networkHealth, setNetworkHealth] = useState("NOT_CONFIGURED");
  const [currentAd, setCurrentAd] = useState<AdCampaign | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const stateRef = useRef<ConnectionState>(state);
  stateRef.current = state;
  const sessionRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const viewingRef = useRef<{ viewId: string; campaignId: string } | null>(null);
  const disposedRef = useRef(false);

  const networkAdapter = useMemo(() => resolveNetworkAdapter(), []);
  const defaultSiteId = getConfig().EXPO_PUBLIC_DEFAULT_SITE_ID;

  const transition = useCallback((action: string) => {
    setState((prev) => {
      const next = canTransition(prev, action);
      if (!next) return prev;
      const reason = getDisconnectReason(prev, action);
      if (reason) setDisconnectReason(reason);
      return next;
    });
  }, []);

  // Réconciliation d'un état quota-status complet vers la machine locale.
  const reconcileFromQuota = useCallback(
    (st: QuotaStatusShape) => {
      setUsage(allocationToUsage(st.allocation));
      const s = st.session;
      const wifi = serverSessionToWifi(s);
      setActiveSession(wifi);
      if (!s?.session_id) {
        return;
      }
      sessionRef.current = s.session_id;
      const status = s.status ?? "";
      const source = s.disconnect_reason ?? undefined;
      const routerConfirmed = Boolean(s.router_session_reference);
      if (ACTIVE_SERVER_STATUSES.has(status)) {
        if (status === "paused") {
          if (stateRef.current === "wifi_active") setState("paused");
          setInternetStatus("active");
        } else if ((status === "authorized" || status === "active") && routerConfirmed) {
          // wifi_active UNIQUEMENT si l'agent et le MikroTik ont confirmé
          // (router_session_reference présent). Une session "authorized" sans
          // référence = autorisation en cours, jamais Wi-Fi actif.
          if (stateRef.current === "idle") setState("wifi_active");
          setInternetStatus("active");
        } else {
          // pending/authorizing/authorized sans référence routeur : en attente.
          if (stateRef.current === "idle" || stateRef.current === "wifi_active") {
            setState("authorizing_wifi");
          }
        }
      } else {
        // Session fermée côté serveur : on reflète le motif exact.
        setSessionRefAndClear();
        if (source === "QUOTA_EXHAUSTED") {
          setInternetStatus("cut");
          // on reste/idem : machine reflète
          if (stateRef.current !== "quota_exhausted") setState("quota_exhausted");
          setDisconnectReason("QUOTA_EXHAUSTED");
        } else if (source) {
          setInternetStatus("cut");
          setDisconnectReason(source as DisconnectReason);
          if (stateRef.current !== "idle") setState("idle");
        }
      }
    },
    []
  );

  function setSessionRefAndClear() {
    sessionRef.current = null;
  }

  const refreshUsageFrom = useCallback((st: QuotaStatusShape) => {
    setUsage(allocationToUsage(st.allocation));
    setLastSyncAt(new Date().toISOString());
  }, []);

  const refreshUsage = useCallback(async () => {
    const st = await fetchQuotaStatus(defaultSiteId ?? null);
    if (disposedRef.current) return;
    reconcileFromQuota(st);
  }, [defaultSiteId, reconcileFromQuota]);

  // ————————————————————————————————————————————————————————
  // Restauration au montage / changement d'utilisateur
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (!user) {
      sessionRef.current = null;
      setState("idle");
      return;
    }
    disposedRef.current = false;
    registerDevice().then((r) => logger.info(TAG, "Device enregistré", r.status));
    refreshUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ————————————————————————————————————————————————————————
  // Battement publicitaire (maintient la session en vie côté serveur)
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (state !== "wifi_active" && state !== "paused") return;
    const sessionId = sessionRef.current;
    if (!sessionId) return;

    let cancelled = false;
    const beat = async () => {
      try {
        const r = await adHeartbeat(sessionId);
        if (cancelled) return;
        if (r.outcome === "quota_exhausted") {
          setInternetStatus("cut");
          setDisconnectReason("QUOTA_EXHAUSTED");
          setState("quota_exhausted");
        } else if (r.outcome === "no_session" || r.outcome === "session_not_active") {
          setSessionRefAndClear();
          setInternetStatus("cut");
          setState((prev) => (prev === "wifi_active" || prev === "paused" ? "idle" : prev));
        }
      } catch (e) {
        logger.warn(TAG, "heartbeat impossible", e);
      }
    };

    beat();
    const t = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [state]);

  // ————————————————————————————————————————————————————————
  // Lecture périodique du quota serveur (source de vérité)
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (!user || state === "idle") return;
    refreshUsage();
    const t = setInterval(refreshUsage, QUOTA_POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, state]);

  // ————————————————————————————————————————————————————————
  // Arrière-plan (AppState)
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === "active" && next !== "active") {
        const s = stateRef.current;
        if (s === "ad_active" || s === "ad_loading") {
          invalidateAd();
        } else if (s === "wifi_active") {
          // Grâce serveur (25 s) : arrêt volontaire du battement.
          setState("paused");
        } else if (s === "paused") {
          // nada
        }
      } else if (prev !== "active" && next === "active") {
        if (stateRef.current === "paused") {
          setState("wifi_active"); // le battement reprend à l'instant T
          refreshUsage();
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invalidateAd() {
    if (viewingRef.current) {
      const { viewId } = viewingRef.current;
      await completeAdView(viewId, 0); // < durée minimale → rejeté côté serveur
      viewingRef.current = null;
    }
    setCurrentAd(null);
    setAdProgress(0);
    setInternetStatus("cut");
    setState("idle");
  }

  // ————————————————————————————————————————————————————————
  // Connexion : publicité obligatoire puis session Wi-Fi.
  // ————————————————————————————————————————————————————————
  const connect = useCallback(async () => {
    if (!user) return;
    const s = stateRef.current;
    if (s !== "idle" && s !== "quota_exhausted" && s !== "error") return;

    transition(ACTIONS.CONNECT);
    setInternetStatus("cut");
    setDisconnectReason(undefined);

    try {
      const health = await networkAdapter.healthCheck();
      setNetworkHealth(health);

      const available = await getAvailableCampaign();
      if (available.reason !== "available" || !available.campaign) {
        setCurrentAd(null);
        setState("idle");
        return;
      }
      setCurrentAd(available.campaign);

      const started = await startAdView(available.campaign.id);
      if (!started) {
        setCurrentAd(null);
        setState("idle");
        return;
      }
      viewingRef.current = { viewId: started.viewId, campaignId: available.campaign.id };
      transition(ACTIONS.AD_AVAILABLE);

      const total = available.campaign.durationSeconds;
      let elapsed = 0;
      const tick = setInterval(() => {
        elapsed += 1;
        setAdProgress(Math.min(elapsed / total, 1));
        if (elapsed >= total) {
          clearInterval(tick);
          finalizeAdView(started.viewId, elapsed);
        }
      }, 1000);
    } catch (e) {
      logger.warn(TAG, "Connexion impossible", e);
      setCurrentAd(null);
      setInternetStatus("cut");
      setState("idle");
    }
  }, [user, transition, networkAdapter]);

  // ————————————————————————————————————————————————————————
  // Fin de publicité : demande de session + attente de l'autorisation.
  // ————————————————————————————————————————————————————————
  async function finalizeAdView(viewId: string, watchedSeconds: number) {
    const result = await completeAdView(viewId, watchedSeconds);
    viewingRef.current = null;
    setCurrentAd(null);

    if (!result.success || !result.rewardGranted) {
      setAdProgress(0);
      setState("idle");
      return;
    }

    // Nouveau contrat : session_token généré côté téléphone, aucune
    // valeur en clair transmise au serveur.
    const sessionToken = sessionTokenRef.current ?? (sessionTokenRef.current = uuidV4());
    const siteId = defaultSiteId;
    const req = await requestWifiSession({
      siteId,
      sessionToken,
      deviceObservedIp: undefined,
    });

    if (!req.ok) {
      if (req.outcome === "quota_exhausted" || req.reason === "quota_exhausted") {
        setDisconnectReason("QUOTA_EXHAUSTED");
        setInternetStatus("cut");
        setState("quota_exhausted");
      } else {
        setState("idle");
      }
      return;
    }

    if (req.sessionId) {
      sessionRef.current = req.sessionId;
      setActiveSession({ id: req.sessionId, status: "authorized" });
    }
    // La session est créée en statut 'authorized' avec authorization_state
    // 'requested' : l'agent local consomme la commande signée en arrière-plan.
    // On n'attend pas le retour synchrone du routeur — on l'observe ensuite
    // via quota-status (router_session_reference) pendant une brève fenêtre.
    transition(ACTIONS.AD_WATCHED); // ad_active → authorizing_wifi

    const verdict = await waitForAuthorization(siteId);
    if (disposedRef.current) return;

    if (verdict.ok) {
      transition(ACTIONS.SESSION_AUTHORIZED);
      setInternetStatus("active");
      refreshUsage();
    } else if (verdict.exhausted) {
      setDisconnectReason("QUOTA_EXHAUSTED");
      setInternetStatus("cut");
      setState("quota_exhausted");
    } else {
      // Aucune confirmation de l'agent/MikroTik (hors ligne, refus, ou
      // délai dépassé). Jamais de wifi_active sans le routeur réel.
      setDisconnectReason("ROUTER_ERROR");
      setInternetStatus("cut");
      setState("error");
    }
  }

  async function waitForAuthorization(siteId?: string): Promise<{ ok: boolean; exhausted?: boolean }> {
    const deadline = Date.now() + AUTHORIZE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const st = await fetchQuotaStatus(siteId ?? null);
      if (disposedRef.current) return { ok: false };
      refreshUsageFrom(st);
      const s = st.session;
      if (s?.session_id) {
        setActiveSession(serverSessionToWifi(s));
        const status = s.status ?? "";
        const routerConfirmed = Boolean(s.router_session_reference);
        // wifi_active n'apparaît qu'APRÈS confirmation réelle de l'agent &
        // du MikroTik : la session reste "authorized" tant que l'agent n'a
        // pas transmis router_session_reference (résultat RouterOS réel).
        // Sans cette référence, on NE peut PAS afficher Wi-Fi actif.
        if ((status === "authorized" || status === "active") && routerConfirmed) {
          return { ok: true };
        }
        if (status === "failed" || status === "disconnected") {
          return { ok: false };
        }
        if (s.disconnect_reason === "QUOTA_EXHAUSTED") {
          return { ok: false, exhausted: true };
        }
      }
      await delay(1200);
    }
    return { ok: false };
  }

  // ————————————————————————————————————————————————————————
  // Déconnexion manuelle.
  // ————————————————————————————————————————————————————————
  const disconnect = useCallback(async () => {
    const sessionId = sessionRef.current;
    transition(ACTIONS.DISCONNECT); // wifi_active/paused → disconnecting
    if (sessionId) {
      try {
        await endWifiSession(sessionId, "USER_PAUSED_AD");
      } catch (e) {
        logger.warn(TAG, "Fin de session impossible", e);
      }
    }
    setActiveSession(null);
    setSessionRefAndClear();
    setInternetStatus("cut");
    setAdProgress(0);
    transition(ACTIONS.DISCONNECTED); // → idle
  }, [transition]);

  // ————————————————————————————————————————————————————————
  // Renouvellement : la réinitialisation de l'allocation est MANUELLE
  // (admin) ; on consulte le serveur au cas où l'admin a agi.
  // ————————————————————————————————————————————————————————
  const refillQuota = useCallback(async () => {
    const st = await fetchQuotaStatus(defaultSiteId ?? null);
    if (disposedRef.current) return;
    const a = st.allocation;
    if (a && a.status === "active" && (a.remaining_bytes ?? 0) > 0) {
      setDisconnectReason(undefined);
      setUsage(allocationToUsage(st.allocation));
      setState("idle");
    } else {
      // Quota toujours épuisé : l'utilisateur doit contacter un gest.
      setUsage(allocationToUsage(st.allocation));
      setState("quota_exhausted");
    }
  }, [defaultSiteId]);

  const stateLabel = STATE_LABELS[state];
  const reasonLabel = disconnectReason ? REASON_LABELS[disconnectReason] : undefined;

  const value = useMemo<ConnectionContextValue>(
    () => ({
      state,
      internetStatus,
      usage,
      stateLabel,
      disconnectReason,
      reasonLabel,
      activeSession,
      adProgress,
      networkHealth,
      currentAd,
      lastSyncAt,
      connect,
      disconnect,
      refillQuota,
    }),
    [state, internetStatus, usage, stateLabel, disconnectReason, reasonLabel, activeSession, adProgress, networkHealth, currentAd, lastSyncAt, connect, disconnect, refillQuota]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}