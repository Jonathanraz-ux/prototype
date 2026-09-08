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
  requestDemoWifiSession,
  simulateDemoConsumption,
  resetDemoQuota,
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
import { resolveNetworkAdapter, type NetworkMode } from "../network";
import { getConfig } from "../lib/config";
import { uuidV4 } from "../lib/uuid";
import { logger } from "../lib/logger";
import { vpnBlocker, type VpnBlockerStatus } from "../services/vpnBlocker";
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
const NATIVE_AUTH_TTL_MS = 25000;

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
  networkMode: NetworkMode;
  vpnStatus: VpnBlockerStatus | null;
  setNetworkMode: (mode: NetworkMode) => void;
  requestVpnConsent: () => Promise<boolean>;
  consumeSimulatedBytes: (bytes: number) => Promise<void>;
  resetDemoAllocation: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
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
  const remainingBytes = Math.max(0, a?.remaining_bytes ?? quotaBytes);
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
  const [networkMode, setNetworkModeState] = useState<NetworkMode>(
    (getConfig().EXPO_PUBLIC_NETWORK_MODE as NetworkMode) ?? "mikrotik"
  );
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
  const [vpnStatus, setVpnStatus] = useState<VpnBlockerStatus | null>(null);

  const stateRef = useRef<ConnectionState>(state);
  stateRef.current = state;
  const networkModeRef = useRef<NetworkMode>(networkMode);
  networkModeRef.current = networkMode;
  const sessionRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const viewingRef = useRef<{ viewId: string; campaignId: string } | null>(null);
  const disposedRef = useRef(false);

  const networkAdapter = useMemo(() => resolveNetworkAdapter(networkMode), [networkMode]);
  const defaultSiteId = getConfig().EXPO_PUBLIC_DEFAULT_SITE_ID;

  const setNetworkMode = useCallback((mode: NetworkMode) => {
    logger.info(TAG, "Changement de mode réseau", mode);
    setNetworkModeState(mode);
  }, []);

  const transition = useCallback((action: string) => {
    setState((prev) => {
      const next = canTransition(prev, action);
      if (!next) return prev;
      const reason = getDisconnectReason(prev, action);
      if (reason) setDisconnectReason(reason);
      return next;
    });
  }, []);

  // Écoute des changements d'état du VpnService natif
  useEffect(() => {
    if (networkMode !== "android_vpn_demo") return;

    vpnBlocker.getStatus().then(setVpnStatus).catch(() => {});
    const unsub = vpnBlocker.addStateListener((evt) => {
      setVpnStatus((prev) => ({
        consentGranted: prev?.consentGranted ?? true,
        serviceRunning: prev?.serviceRunning ?? true,
        state: evt.state,
        tunnelUp: evt.tunnelUp,
        generation: evt.generation,
        authTtlMs: Math.max(0, evt.authExpiresAt - Date.now()),
      }));
    });
    return unsub;
  }, [networkMode]);

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
      const isVpnDemo = networkModeRef.current === "android_vpn_demo";
      const routerConfirmed = isVpnDemo || Boolean(s.router_session_reference);

      if (ACTIVE_SERVER_STATUSES.has(status)) {
        if (status === "paused") {
          if (stateRef.current === "wifi_active") {
            setState("paused");
            if (isVpnDemo) {
              vpnBlocker.blockNow().catch(() => {});
            }
          }
          setInternetStatus("active");
        } else if ((status === "authorized" || status === "active") && routerConfirmed) {
          if (stateRef.current === "idle") setState("wifi_active");
          setInternetStatus("active");
        } else {
          if (stateRef.current === "idle" || stateRef.current === "wifi_active") {
            setState("authorizing_wifi");
          }
        }
      } else {
        // Session fermée côté serveur : on reflète le motif exact.
        setSessionRefAndClear();
        if (isVpnDemo) {
          vpnBlocker.blockNow().catch(() => {});
        }
        if (source === "QUOTA_EXHAUSTED") {
          setInternetStatus("cut");
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

    if (networkMode === "android_vpn_demo") {
      vpnBlocker.getStatus().then((status) => {
        setVpnStatus(status);
        if (status.consentGranted && !status.serviceRunning) {
          vpnBlocker.startBlocking().catch(() => {});
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, networkMode]);

  // ————————————————————————————————————————————————————————
  // Battement publicitaire (maintient la session en vie côté serveur)
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (state !== "wifi_active" && state !== "paused") return;
    const sessionId = sessionRef.current;
    if (!sessionId) return;

    let cancelled = false;
    const isVpnDemo = networkMode === "android_vpn_demo";

    const beat = async () => {
      try {
        const r = await adHeartbeat(sessionId);
        if (cancelled) return;
        if (r.outcome === "quota_exhausted") {
          if (isVpnDemo) await vpnBlocker.blockNow();
          setInternetStatus("cut");
          setDisconnectReason("QUOTA_EXHAUSTED");
          setState("quota_exhausted");
        } else if (r.outcome === "no_session" || r.outcome === "session_not_active") {
          if (isVpnDemo) await vpnBlocker.blockNow();
          setSessionRefAndClear();
          setInternetStatus("cut");
          setState((prev) => (prev === "wifi_active" || prev === "paused" ? "idle" : prev));
        } else if (r.outcome === "ok" && stateRef.current === "wifi_active" && isVpnDemo) {
          // Renouvelle l'échéance native sur horloge monotone
          await vpnBlocker.setAuthorized(NATIVE_AUTH_TTL_MS);
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
  }, [state, networkMode]);

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
  // Arrière-plan (AppState) & verrouillage écran
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const isVpnDemo = networkModeRef.current === "android_vpn_demo";

      if (prev === "active" && next !== "active") {
        const s = stateRef.current;
        if (isVpnDemo) {
          // Blocage natif immédiat et invalidation génération
          await vpnBlocker.blockNow();
          await vpnBlocker.invalidateGeneration();
        }
        if (s === "ad_active" || s === "ad_loading") {
          invalidateAd();
        } else if (s === "wifi_active") {
          setState("paused");
        }
      } else if (prev !== "active" && next === "active") {
        if (stateRef.current === "paused") {
          if (isVpnDemo && usage.remainingQuotaMB > 0) {
            await vpnBlocker.setAuthorized(NATIVE_AUTH_TTL_MS);
          }
          setState("wifi_active");
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
      await completeAdView(viewId, 0);
      viewingRef.current = null;
    }
    setCurrentAd(null);
    setAdProgress(0);
    setInternetStatus("cut");
    setState("idle");
    if (networkModeRef.current === "android_vpn_demo") {
      await vpnBlocker.blockNow();
    }
  }

  // ————————————————————————————————————————————————————————
  // Consentement VPN
  // ————————————————————————————————————————————————————————
  const requestVpnConsent = useCallback(async (): Promise<boolean> => {
    const res = await vpnBlocker.requestConsent();
    if (res.granted) {
      await vpnBlocker.startBlocking();
      const status = await vpnBlocker.getStatus();
      setVpnStatus(status);
      return true;
    }
    const status = await vpnBlocker.getStatus();
    setVpnStatus(status);
    return false;
  }, []);

  // ————————————————————————————————————————————————————————
  // Connexion : publicité obligatoire puis session Wi-Fi.
  // ————————————————————————————————————————————————————————
  const connect = useCallback(async () => {
    if (!user) return;
    const s = stateRef.current;
    if (s !== "idle" && s !== "quota_exhausted" && s !== "error" && s !== "paused") return;

    if (s === "paused") {
      // Reprise directe
      if (usage.remainingQuotaMB <= 0) {
        setState("quota_exhausted");
        setInternetStatus("cut");
        return;
      }
      if (networkMode === "android_vpn_demo") {
        const authRes = await vpnBlocker.setAuthorized(NATIVE_AUTH_TTL_MS);
        if (authRes.ok) {
          setState("wifi_active");
          setInternetStatus("active");
          return;
        }
      } else {
        setState("wifi_active");
        setInternetStatus("active");
        return;
      }
    }

    // Si mode démo Android et pas de consentement, demander d'abord
    if (networkMode === "android_vpn_demo") {
      const granted = await vpnBlocker.isConsentGranted();
      if (!granted) {
        const ok = await requestVpnConsent();
        if (!ok) {
          logger.warn(TAG, "Consentement VPN non accordé");
          return;
        }
      }
      await vpnBlocker.startBlocking();
    }

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
  }, [user, transition, networkAdapter, networkMode, requestVpnConsent, usage.remainingQuotaMB]);

  // ————————————————————————————————————————————————————————
  // Fin de publicité : validation et établissement session
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

    const sessionToken = sessionTokenRef.current ?? (sessionTokenRef.current = uuidV4());
    const siteId = defaultSiteId;
    const isVpnDemo = networkModeRef.current === "android_vpn_demo";

    if (isVpnDemo) {
      // Validation démo Supabase dédiée (pas de file MikroTik ni agent nécessaire)
      const req = await requestDemoWifiSession({
        siteId,
        sessionToken,
      });

      if (!req.ok) {
        if (req.outcome === "quota_exhausted" || req.reason === "quota_exhausted") {
          await vpnBlocker.blockNow();
          setDisconnectReason("QUOTA_EXHAUSTED");
          setInternetStatus("cut");
          setState("quota_exhausted");
        } else {
          await vpnBlocker.blockNow();
          setState("idle");
        }
        return;
      }

      if (req.sessionId) {
        sessionRef.current = req.sessionId;
        setActiveSession({ id: req.sessionId, status: "active", routerSessionReference: "vpn-demo-local" });
      }

      // Autorise le trafic côté natif pour 25 s (renouvelé par battement)
      const auth = await vpnBlocker.setAuthorized(NATIVE_AUTH_TTL_MS);
      if (auth.ok) {
        transition(ACTIONS.SESSION_AUTHORIZED);
        setInternetStatus("active");
        setState("wifi_active");
        refreshUsage();
      } else {
        await vpnBlocker.blockNow();
        setDisconnectReason("ROUTER_ERROR");
        setInternetStatus("cut");
        setState("error");
      }
      return;
    }

    // Mode MikroTik normal
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
    transition(ACTIONS.AD_WATCHED);

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
  // Actions démo : simulation de consommation et reset quota
  // ————————————————————————————————————————————————————————
  const consumeSimulatedBytes = useCallback(
    async (bytes: number) => {
      const res = await simulateDemoConsumption(bytes);
      if (res.ok) {
        await refreshUsage();
        if (res.exhausted) {
          if (networkModeRef.current === "android_vpn_demo") {
            await vpnBlocker.blockNow();
          }
          setDisconnectReason("QUOTA_EXHAUSTED");
          setInternetStatus("cut");
          setState("quota_exhausted");
        }
      }
    },
    [refreshUsage]
  );

  const resetDemoAllocation = useCallback(async () => {
    const res = await resetDemoQuota();
    if (res.ok) {
      await refreshUsage();
      setDisconnectReason(undefined);
      if (stateRef.current === "quota_exhausted") {
        setState("idle");
      }
    }
  }, [refreshUsage]);

  const exitDemoMode = useCallback(async () => {
    if (vpnBlocker.isAvailable()) {
      await vpnBlocker.stop();
    }
    setInternetStatus("cut");
    setState("idle");
    setDisconnectReason(undefined);
    setNetworkModeState("mikrotik");
  }, []);

  // ————————————————————————————————————————————————————————
  // Déconnexion manuelle.
  // ————————————————————————————————————————————————————————
  const disconnect = useCallback(async () => {
    const sessionId = sessionRef.current;
    transition(ACTIONS.DISCONNECT);
    if (networkModeRef.current === "android_vpn_demo") {
      await vpnBlocker.blockNow();
    }
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
    transition(ACTIONS.DISCONNECTED);
  }, [transition]);

  const refillQuota = useCallback(async () => {
    const st = await fetchQuotaStatus(defaultSiteId ?? null);
    if (disposedRef.current) return;
    const a = st.allocation;
    if (a && a.status === "active" && (a.remaining_bytes ?? 0) > 0) {
      setDisconnectReason(undefined);
      setUsage(allocationToUsage(st.allocation));
      setState("idle");
    } else {
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
      networkMode,
      vpnStatus,
      setNetworkMode,
      requestVpnConsent,
      consumeSimulatedBytes,
      resetDemoAllocation,
      exitDemoMode,
      connect,
      disconnect,
      refillQuota,
    }),
    [
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
      networkMode,
      vpnStatus,
      setNetworkMode,
      requestVpnConsent,
      consumeSimulatedBytes,
      resetDemoAllocation,
      exitDemoMode,
      connect,
      disconnect,
      refillQuota,
    ]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}