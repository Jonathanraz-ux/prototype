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
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { resolveNetworkAdapter, type NetworkMode, type NetworkProviderKind } from "../network";
import { waitForMikrotikAuthorization } from "../lib/mikrotikAuth";
import { getConfig } from "../lib/config";
import {
  watchedSecondsFromDurationMillis,
  resumeQuotaDecision,
} from "../lib/serverAuth";
import {
  createSessionEpoch,
  createFlowGate,
  decideHeartbeat,
  signalFromServer,
  applyServerSignal,
  buildReconciliationReport,
  quotaConsumedBytes,
  bytesToMiB,
  CONTROL_FAILURE_THRESHOLD,
  resumeFailureAction,
  type ServerSessionView,
} from "../lib/sessionControl";
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
const AD_LOAD_TIMEOUT_MS = 20000;
const DEMO_SESSION_TOKEN_STORAGE_PREFIX = "@wifizone/session_token/";

// NOTE — Aucun état de session/quota n'est autorisé localement sans preuve
// serveur. Les époques (epochGuard) invalident toute réponse tardive ; la
// porte de flux (flowGate) interdit deux établissements simultanés ; le
// seuil CONTROL_FAILURE_THRESHOLD (sessionControl.ts) coupe au bout de N
// défaillances consécutives du contrôle (motif NETWORK_LOST).

export interface ConnectionContextValue {
  state: ConnectionState;
  internetStatus: InternetStatus;
  usage: UsageStats;
  stateLabel: string;
  disconnectReason: DisconnectReason | undefined;
  reasonLabel: string | undefined;
  activeSession: WifiSession | null;
  adProgress: number;
  adIsPlaying: boolean;
  adBuffering: boolean;
  adError: string | null;
  lastError: string | null;
  networkHealth: string;
  networkProviderKind: NetworkProviderKind;
  currentAd: AdCampaign | null;
  lastSyncAt: string | null;
  networkMode: NetworkMode;
  vpnStatus: VpnBlockerStatus | null;
  isResuming: boolean;
  /**
   * Compteur de VISIONNAGES : incrémenté à chaque nouveau start-ad-view.
   * Casse l'écueil du lecteur expo-av qui, recyclé par la clé de campagne
   * constante, restait bloqué en fin de vidéo et ne rejouait pas : la clé
   * du lecteur devient campagne:visionnage → chaque nouveau passage remonte
   * le lecteur depuis le début (didJustFinish fiable pour la validation).
   */
  adViewNonce: number;
  /** Renouvellement d'autorisation immédiat (battement unique, borné). */
  renewNow: () => Promise<void>;
  setNetworkMode: (mode: NetworkMode) => void;
  requestVpnConsent: () => Promise<boolean>;
  consumeSimulatedBytes: (bytes: number) => Promise<void>;
  resetDemoAllocation: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  pauseSession: () => Promise<void>;
  refillQuota: () => Promise<void>;
  handlePlaybackStatusUpdate: (status: any) => Promise<void>;
  handleAdMediaError: (error: string) => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export function allocationToUsage(a?: ServerAllocation | null): UsageStats {
  const quotaBytes = a?.quota_bytes ?? 0;
  const remainingBytes = Math.max(0, a?.remaining_bytes ?? quotaBytes);
  const consumedBytes = quotaConsumedBytes(quotaBytes, remainingBytes);
  // Unité serveur = octets ; l'affichage en Mo est dérivé (base 1024).
  return {
    remainingQuotaMB: bytesToMiB(remainingBytes),
    totalQuotaMB: bytesToMiB(quotaBytes),
    remainingTimeMinutes: 0,
    totalTimeMinutes: 0,
    todayConsumptionMB: bytesToMiB(consumedBytes),
    totalBytes: quotaBytes,
    remainingBytes,
    consumedBytes,
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
  const [adIsPlaying, setAdIsPlaying] = useState(false);
  const [adBuffering, setAdBuffering] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [networkHealth, setNetworkHealth] = useState("NOT_CONFIGURED");
  const [currentAd, setCurrentAd] = useState<AdCampaign | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [vpnStatus, setVpnStatus] = useState<VpnBlockerStatus | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [adViewNonce, setAdViewNonce] = useState(0);

  const stateRef = useRef<ConnectionState>(state);
  stateRef.current = state;
  const networkModeRef = useRef<NetworkMode>(networkMode);
  networkModeRef.current = networkMode;
  const sessionRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const resumingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const viewingRef = useRef<{ viewId: string; campaignId: string } | null>(null);
  const onLoadTracedRef = useRef<string>("");
  const disposedRef = useRef(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeFromPausedRef = useRef<() => Promise<void>>(async () => {});
  // Garde-fous centraux de session (purs, testés dans sessionControl.test.ts).
  const epochGuard = useMemo(() => createSessionEpoch(), []);
  const flowGate = useMemo(() => createFlowGate(), []);
  const controlFailuresRef = useRef(0);
  const vpnStatusRef = useRef<VpnBlockerStatus | null>(null);
  /** Vrai quand un battement est en cours : jamais deux renouvellements concurrents. */
  const heartbeatInFlightRef = useRef(false);
  /** Dernière fonction de battement active (réutilisée par renewNow). */
  const heartbeatRef = useRef<(() => Promise<void>) | null>(null);
  /** Watchdog explicite de sortie de l'état authorizing_wifi (cul-de-sac). */
  const authorizeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateVpnStatus = useCallback((next: VpnBlockerStatus | null) => {
    vpnStatusRef.current = next;
    setVpnStatus(next);
  }, []);

  /**
   * Jeton de session démo persisté PAR UTILISATEUR. Objectif : une pause ou
   * un redémarrage ne doit JAMAIS créer involontairement une NOUVELLE session
   * serveur (le RPC request_demo_wifi_session résume la même session quand le
   * jeton est inchangé). Le jeton est effacé à la déconnexion/hors connexion.
   */
  const sessionTokenStorageKey = useCallback(() => {
    return user?.id ? `${DEMO_SESSION_TOKEN_STORAGE_PREFIX}${user.id}` : null;
  }, [user?.id]);

  const persistSessionToken = useCallback(
    async (token: string) => {
      sessionTokenRef.current = token;
      const key = sessionTokenStorageKey();
      if (!key) return;
      try {
        await AsyncStorage.setItem(key, token);
      } catch (e) {
        logger.warn(TAG, "Persistance du jeton de session impossible", e);
      }
    },
    [sessionTokenStorageKey]
  );

  const clearPersistedSessionToken = useCallback(async () => {
    sessionTokenRef.current = null;
    const key = sessionTokenStorageKey();
    if (!key) return;
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      logger.warn(TAG, "Suppression du jeton de session impossible", e);
    }
  }, [sessionTokenStorageKey]);

  // Chargement au démarrage / changement d'utilisateur : restaure le jeton
  // du même utilisateur pour NE PAS partitionner la session après un kill.
  useEffect(() => {
    const key = sessionTokenStorageKey();
    if (!key) {
      sessionTokenRef.current = null;
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!cancelled && raw) sessionTokenRef.current = raw;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionTokenStorageKey]);

  /**
   * Suspension centralisée et idempotente :
   *  - invalide toutes les réponses en vol (epoch) ;
   *  - ferme tout flux en cours (un éventuel second appui repartira proprement) ;
   *  - coupe/annule l'autorisation native (mode démo) ;
   *  - reflète l'état réel sur les écrans (internetStatus + state).
   * Une réponse serveur tardive ne peut donc JAMAIS réactiver cette session.
   */
  const suspendInto = useCallback(
    async (
      target: ConnectionState,
      reason?: DisconnectReason,
      internet: InternetStatus = "cut",
      opts?: { clearSession?: boolean }
    ) => {
      epochGuard.advance();
      flowGate.forceClose();
      controlFailuresRef.current = 0;
      if (networkModeRef.current === "android_vpn_demo") {
        await vpnBlocker.blockNow();
        await vpnBlocker.invalidateGeneration();
      }
      if (opts?.clearSession) {
        sessionRef.current = null;
        setActiveSession(null);
      }
      if (reason) setDisconnectReason(reason);
      setInternetStatus(internet);
      setState(target);
    },
    []
  );

  const noteControlSuccess = useCallback(() => {
    controlFailuresRef.current = 0;
  }, []);

  /** Enregistre une défaillance du contrôle ; renvoie true au-delà du seuil. */
  const noteControlFailure = useCallback((): boolean => {
    controlFailuresRef.current += 1;
    if (controlFailuresRef.current >= CONTROL_FAILURE_THRESHOLD) {
      controlFailuresRef.current = 0;
      return true;
    }
    return false;
  }, []);

  /**
   * Décision d'autorisation native exclusivement à partir des DATES SERVEUR
   * (request_demo_wifi_session → heartbeat_expires_at). Aucun repli local :
   * une échéance inexploitable produit « block » (jamais 25 s automatiques).
   */
  const serverTtlDecision = useCallback((heartbeatExpiresAt?: string) => {
    return decideHeartbeat({
      outcome: "ok",
      server_time: heartbeatExpiresAt
        ? new Date(Date.parse(heartbeatExpiresAt) - NATIVE_AUTH_TTL_MS).toISOString()
        : undefined,
      heartbeat_expires_at: heartbeatExpiresAt ?? undefined,
    });
  }, []);

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

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const startLoadingTimer = useCallback(() => {
    clearLoadingTimer();
    loadingTimerRef.current = setTimeout(() => {
      loadingTimerRef.current = null;
      if (networkModeRef.current === "android_vpn_demo") {
        vpnBlocker.blockNow().catch(() => {});
      }
      setLastError("Le contenu publicitaire n'a pas pu se charger en temps voulu.");
      setInternetStatus("cut");
      setState("idle");
    }, AD_LOAD_TIMEOUT_MS);
  }, [clearLoadingTimer]);

  // Nettoyage du timer de chargement au démontage : aucune fuite vers un nouvel essai.
  useEffect(() => {
    return () => clearLoadingTimer();
  }, [clearLoadingTimer]);

  const loadAvailableAd = useCallback(async () => {
    try {
      const available = await getAvailableCampaign();
      if (available.reason === "available" && available.campaign) {
        setCurrentAd(available.campaign);
        setLastError(null);
      } else {
        setCurrentAd(null);
        setLastError(available.errorMessage ?? "Aucune campagne publicitaire disponible");
      }
    } catch (e: any) {
      setCurrentAd(null);
      setLastError(e?.message ?? "Erreur lors du chargement de la campagne");
    }
  }, [user?.email, user?.id]);

  // Écoute des changements d'état du VpnService natif
  useEffect(() => {
    if (networkMode !== "android_vpn_demo") return;

    vpnBlocker.getStatus().then((status) => updateVpnStatus(status)).catch(() => {});
    const unsub = vpnBlocker.addStateListener((evt) => {
      updateVpnStatus({
        consentGranted: vpnStatusRef.current?.consentGranted ?? true,
        serviceRunning: true,
        state: evt.state,
        tunnelUp: evt.tunnelUp,
        generation: evt.generation,
        // Le TTL provient de l'horloge native (elapsedRealtime), pas de
        // Date.now() : insensible aux changements d'heure / fuseau du client.
        authTtlMs:
          evt.ttlLeftMs != null
            ? Math.max(0, evt.ttlLeftMs)
            : Math.max(0, evt.authExpiresAt - Date.now()),
      });
    });
    return unsub;
  }, [networkMode, updateVpnStatus]);

  // Réconciliation d'un état quota-status complet vers la machine locale.
  // Le serveur est la seule source de vérité : en mode démo, une session
  // « active » côté serveur n'active JAMAIS le Wi-Fi sans autorisation
  // native réellement obtenue (nativeAllowed) — une panne de contrôle ne
  // montre jamais un écran « Connecté ».
  const reconcileFromQuota = useCallback(
    async (st: QuotaStatusShape) => {
      setUsage(allocationToUsage(st.allocation));
      const s: ServerSessionView | null = st.session ?? null;
      setActiveSession(serverSessionToWifi(st.session));
      if (!s?.status) return; // pas de session serveur : aucun saut d'état imposé
      sessionRef.current = st.session?.session_id ?? null;
      const isVpnDemo = networkModeRef.current === "android_vpn_demo";

      let nativeAllowed = false;
      if (isVpnDemo) {
        const status = await vpnBlocker.getStatus().catch(() => null);
        if (status) updateVpnStatus(status);
        nativeAllowed = status?.state === "ALLOWED" && (status.authTtlMs ?? 0) > 0;
      }

      // Un flux d'établissement en vol (ad_loading/ad_active) ne doit JAMAIS
      // être intercédé par un poll : il possède le contrôle jusqu'à sa
      // finalisation (sinon, un ancien signal « active » obsolète re-crée
      // authorizing_wifi en plein démarrage, BUG oscillation).
      const inFlight =
        stateRef.current === "ad_loading" ||
        stateRef.current === "ad_active" ||
        stateRef.current === "disconnecting";

      const serverNow = st.server_time ? Date.parse(st.server_time) : Number.NaN;
      const signal = signalFromServer(
        s,
        isVpnDemo ? { enforceExpiry: true, now: Number.isNaN(serverNow) ? Date.now() : serverNow } : undefined
      );
      const decision = applyServerSignal(signal, stateRef.current, { isVpnDemo, nativeAllowed });

      if (!decision.apply || inFlight) return;

      // En démo, tout sauf un accès/une autorisation en cours ⇒ blocage natif.
      if (isVpnDemo && signal.mode !== "active" && signal.mode !== "authorizing") {
        await vpnBlocker.blockNow();
      }
      if (signal.mode === "closed" || signal.mode === "quota_exhausted") {
        sessionRef.current = null;
      }
      if (decision.reason) setDisconnectReason(decision.reason);
      if (decision.wantInternet) setInternetStatus(decision.wantInternet);
      if (decision.wantState) setState(decision.wantState);
    },
    []
  );

  const refreshUsageFrom = useCallback((st: QuotaStatusShape) => {
    setUsage(allocationToUsage(st.allocation));
    setLastSyncAt(new Date().toISOString());
    const report = buildReconciliationReport(
      st.allocation,
      (st.session ?? null) as ServerSessionView | null
    );
    logger.info(
      TAG,
      `sync quota consommé=${report.server.consumedBytes} restant=${report.server.remainingBytes} total=${report.server.quotaBytes} routeur=${report.router.bytesTotal} delta=${report.deltaWhenRouterTotalKnown ?? "-"}`
    );
  }, []);

  const refreshUsage = useCallback(async () => {
    const st = await fetchQuotaStatus(defaultSiteId ?? null);
    if (disposedRef.current) return;
    if (st.allocation || st.session) {
      noteControlSuccess();
    } else if (Object.keys(st).length > 0) {
      // Serveur a répondu mais aucune allocation/session active : problème
      // réel de contrôle → compté. Au-delà du seuil, coupe + ré-autorisation.
      const exceeded = noteControlFailure();
      if (exceeded) {
        await suspendInto("error", "NETWORK_LOST", "suspended");
        return;
      }
    } else {
      // Fetch échoué (timeout/réseau) : PAS un échec de contrôle.
      // Le heartbeat reste l'autorité ; on ne coupe pas une session saine
      // pour une simple noise réseau de ce poll.
    }
    reconcileFromQuota(st);
  }, [defaultSiteId, reconcileFromQuota, noteControlSuccess, noteControlFailure, suspendInto]);

  // ————————————————————————————————————————————————————————
  // Restauration au montage / changement d'utilisateur
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (!user) {
      sessionRef.current = null;
      epochGuard.advance();
      flowGate.forceClose();
      controlFailuresRef.current = 0;
      setState("idle");
      return;
    }
    disposedRef.current = false;
    // Auto-guérison : un état « en vol » (ad_loading/ad_active/
    // authorizing_wifi) jamais soldé ne peut plus aboutir dans ce
    // processus — on le ramène à idle pour que connect() reste possible
    // sur cette session (BUG v6-2). Ne couvrait qu'"paused" auparavant.
    const staleInFlight =
      stateRef.current === "ad_loading" ||
      stateRef.current === "ad_active" ||
      stateRef.current === "authorizing_wifi";
    if (staleInFlight) {
      logger.info(TAG, "Réinitialisation d'un état de session obsolète", stateRef.current);
      epochGuard.advance();
      flowGate.forceClose();
      vpnBlocker.blockNow().catch(() => {});
      setDisconnectReason(undefined);
      setInternetStatus("cut");
      setState("idle");
    }
    registerDevice().then((r) => logger.info(TAG, "Device enregistré", r.status));
    refreshUsage();
    loadAvailableAd();

    if (networkMode === "android_vpn_demo") {
      // Blocage de base au démarrage (reboot applicatif / force-stop) :
      // aucun accès résiduel n'est hérité d'une vie antérieure du process.
      vpnBlocker.blockNow().catch(() => {});
      vpnBlocker.getStatus().then((status) => {
        updateVpnStatus(status);
        if (status.consentGranted && !status.serviceRunning) {
          vpnBlocker.startBlocking().catch(() => {});
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, networkMode, loadAvailableAd]);

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
      // Garde-fou d'unicité : un battement déjà en vol n'est jamais doublé
      // (échelon 10 s + renewal immédiat au premier plan / au démarrage de
      // navigation → un seul renouvellement à la fois, jamais de course).
      if (heartbeatInFlightRef.current) {
        vpnBlocker.trace("heartbeat skip (déjà en vol)");
        return;
      }
      heartbeatInFlightRef.current = true;
      try {
        const gen = epochGuard.current;
        let r;
        try {
          r = await adHeartbeat(sessionId);
        } catch (e) {
          logger.warn(TAG, "heartbeat impossible", e);
          // Échec TRANSITOIRE du contrôle (timeout/réseau) : on ne tue pas une
          // session saine pour une simple noise. L'accès réel reste garanti par
          // le kill-switch NATIF (échéance 25 s constante, watchdog 500 ms) :
          // on ne prolonge RIEN, on laisse simplement la prochaine battement
          // (échelon 10 s) revenir. Au-delà du seuil de défaillances, on coupe.
          if (isVpnDemo) {
            vpnBlocker.trace("heartbeat FAILED (transitoire) -> retry au prochain échelon");
            const exceeded = noteControlFailure();
            if (exceeded) {
              await suspendInto("idle", "HEARTBEAT_TIMEOUT");
            }
          } else {
            const exceeded = noteControlFailure();
            if (exceeded) {
              await suspendInto("error", "NETWORK_LOST", "suspended");
            }
          }
          return;
        }
        if (cancelled || !epochGuard.isCurrent(gen)) return; // réponse tardive ignorée

        const decision = decideHeartbeat(r);
        switch (decision.action) {
          case "authorize":
            noteControlSuccess();
            if (isVpnDemo && stateRef.current === "wifi_active") {
              // Renouvellement natif UNIQUEMENT sur confirmation serveur courante,
              // durée dérivée des DATES SERVEUR (jamais extension locale aveugle).
              vpnBlocker.trace(
                `heartbeat ok ttlMs=${decision.ttlMs} base=${r.server_time ?? r.last_heartbeat_at ?? "-"} until=${r.heartbeat_expires_at ?? "-"}`
              );
              await vpnBlocker.setAuthorized(decision.ttlMs);
            } else if (isVpnDemo) {
              // Session en pause : le tunnel DOIT rester coupé (pas de
              // renouvellement natif), mais la session serveur reste battue.
              // Trace explicite : aucun silence théorique du battement.
              vpnBlocker.trace(
                `heartbeat ok (paused, pas de renouvellement natif) ttlMs=${decision.ttlMs} until=${r.heartbeat_expires_at ?? "-"}`
              );
            }
            break;
          case "block":
            if (isVpnDemo) {
              // Échéance serveur absente/illisible/passée → aucun accès.
              vpnBlocker.trace(`heartbeat BLOCKED action=block ttl=0 until=${r.heartbeat_expires_at ?? "-"}`);
              await suspendInto("idle", "HEARTBEAT_TIMEOUT");
            } else {
              const exceeded = noteControlFailure();
              if (exceeded) {
                await suspendInto("error", "NETWORK_LOST", "suspended");
              }
            }
            break;
          case "require_reauth":
            // Session fermée/expirée : une NOUVELLE autorisation vérifiée
            // (publicité ré-regardée) est obligatoire.
            await suspendInto("idle", decision.reason, "cut", { clearSession: true });
            break;
          case "quota_exhausted":
            await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
            break;
        }
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };

    heartbeatRef.current = beat;
    void beat();
    const t = setInterval(() => {
      if (!cancelled) void beat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
      if (heartbeatRef.current === beat) heartbeatRef.current = null;
    };
  }, [state, networkMode, suspendInto, noteControlFailure, noteControlSuccess]);

  /**
   * Renouvellement immédiat du battement (premier plan, début de navigation).
   * Complementaire du battement périodique — jamais un remplacement : l'échelon
   * fixe 10 s continue de maintenir la session en continu.
   */
  const renewNow = useCallback(async () => {
    const s = stateRef.current;
    if (s !== "wifi_active" && s !== "paused") return;
    const beat = heartbeatRef.current;
    if (!beat) return;
    try {
      await beat();
    } catch (e) {
      logger.warn(TAG, "renewNow impossible", e);
    }
  }, []);

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

      if (prev === "active" && next === "background") {
        const s = stateRef.current;
        if (s === "ad_active" || s === "ad_loading") {
          // Publicité en cours : invalidation (epoch + gate + blocage natif).
          await invalidateAd();
        } else if (s === "wifi_active") {
          // Arrière-plan : session serveur vivante mais accès mis en pause
          // et trafic coupé ; le retour au premier plan revaudera côté serveur.
          await suspendInto("paused");
        } else if (isVpnDemo) {
          // Garantie locale : aucun accès résiduel possible hors établissement.
          await vpnBlocker.blockNow();
        }
      } else if (prev !== "active" && next === "active") {
        if (stateRef.current === "paused") {
          // Reprise au premier plan : revalidation serveur obligatoire
          // (session + même quota), jamais d'autorisation locale aveugle.
          await resumeFromPausedRef.current();
        } else if (stateRef.current === "wifi_active") {
          // Session toujours active après un passage en arrière-plan fugitif :
          // renouvellement immédiat (aucune échéance native ne doit expirer
          // sans nouveau battement ; l'échelon périodique continue par ailleurs).
          await renewNow();
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ————————————————————————————————————————————————————————
  // Sortie explicite de l'état authorizing_wifi (cul-de-sac borné).
  // Cet état est posé par la réconciliation quota quand le serveur annonce une
  // session active SANS autorisation native en place. Sans aboutissement
  // (aucun flux en cours pour l'accorder), il pouvait rester figé et
  // verrouiller connect() et l'écran « Autorisation Wi-Fi » : on le quitte
  // explicitement au bout d'un délai borné (chute vers idle, message clair,
  // nouvelle tentative possible). On ne supprime JAMAIS le contrôle : la
  // sortie coupe aussi toute autorisation native résiduelle.
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    if (state !== "authorizing_wifi") {
      if (authorizeWatchdogRef.current) {
        clearTimeout(authorizeWatchdogRef.current);
        authorizeWatchdogRef.current = null;
      }
      return;
    }
    vpnBlocker.trace(`authorizing_wifi watchdog armé (${AUTHORIZE_TIMEOUT_MS} ms)`);
    authorizeWatchdogRef.current = setTimeout(() => {
      authorizeWatchdogRef.current = null;
      if (stateRef.current !== "authorizing_wifi") return;
      vpnBlocker.trace("authorizing_wifi stuck -> sortie explicite vers idle");
      epochGuard.advance();
      flowGate.forceClose();
      vpnBlocker.blockNow().catch(() => {});
      setDisconnectReason(undefined);
      setInternetStatus("cut");
      setState("idle");
      setLastError("Autorisation non confirmée dans le délai. Réessayez depuis l'Accueil.");
    }, AUTHORIZE_TIMEOUT_MS);
    return () => {
      if (authorizeWatchdogRef.current) {
        clearTimeout(authorizeWatchdogRef.current);
        authorizeWatchdogRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function invalidateAd() {
    if (viewingRef.current) {
      const { viewId } = viewingRef.current;
      // Marque finalisée AVANT l'appel réseau : pas de double décompte.
      viewingRef.current = null;
      await completeAdView(viewId, 0).catch(() => {});
    }
    // suspendInto coupe natif (démo), invalide les réponses en vol et
    // referme tout flux en cours.
    await suspendInto("idle");
    setAdIsPlaying(false);
    setAdProgress(0);
  }

  // ————————————————————————————————————————————————————————
  // Gestionnaire des événements réels du lecteur publicitaire
  // ————————————————————————————————————————————————————————
  const handlePlaybackStatusUpdate = useCallback(async (status: any) => {
    if (!status) return;

    if (!status.isLoaded) {
      if (status.error) {
        logger.error(TAG, "Erreur du lecteur vidéo", status.error);
        setAdError(`Erreur lecture vidéo: ${status.error}`);
        setLastError(`Erreur vidéo: ${status.error}`);
        if (networkModeRef.current === "android_vpn_demo") {
          await vpnBlocker.blockNow();
        }
      }
      return;
    }

    const { isPlaying, isBuffering, positionMillis, durationMillis, didJustFinish } = status;
    setAdBuffering(Boolean(isBuffering));
    setAdIsPlaying(Boolean(isPlaying));

    if (durationMillis && durationMillis > 0) {
      setAdProgress(Math.min(positionMillis / durationMillis, 1));
    }

    const isVpnDemo = networkModeRef.current === "android_vpn_demo";
    const s = stateRef.current;

    if (durationMillis && durationMillis > 0) {
      clearLoadingTimer();
    }

    if (isVpnDemo && durationMillis && durationMillis > 0 && onLoadTracedRef.current !== viewingRef.current?.viewId) {
      onLoadTracedRef.current = viewingRef.current?.viewId ?? "";
      vpnBlocker.trace(`onLoad view=${viewingRef.current?.viewId ?? "-"} durationMillis=${durationMillis} (${(durationMillis / 1000).toFixed(1)}s) pos=${positionMillis} playing=${isPlaying}`);
    }

    if (isVpnDemo && isBuffering) {
      vpnBlocker.trace(`buffering view=${viewingRef.current?.viewId ?? "-"} pos=${positionMillis}`);
    }

    if (isVpnDemo && s === "wifi_active" && viewingRef.current !== null) {
      // L'autorisation/renouvellement ne vient JAMAIS du lecteur : uniquement
      // du heartbeat serveur (source de vérité), pour ne jamais prolonger
      // localement une validation serveur obsolète. Le lecteur ne fait que
      // DÉTECTER la pause/le cache LE TEMPS d'un visionnage NON finalisé
      // (viewingRef présent) -> blocage. Après finalise (wifi_active,
      // viewingRef null), les micro-pauses/relectures de la bannière ne
      // doivent PAS tuer une session déjà accordée (oscillation observée
      // wifi_active <-> authorizing_wifi en build debug).
      if (!isPlaying && !didJustFinish) {
        vpnBlocker.trace(`pause-in-session pos=${positionMillis} -> block`);
        await vpnBlocker.blockNow();
      }
    }

    if (didJustFinish && s === "ad_active") {
      setAdIsPlaying(false);
      setAdProgress(1);
      const viewId = viewingRef.current?.viewId ?? "demo-view";
      // Temps RÉELLEMENT regardé (plancher, jamais la durée totale du fichier
      // si elle excède le visionnage). didJustFinish = fin réelle de lecture,
      // on déclare donc la position atteinte (ms) convertie en secondes.
      const actualWatchedMs = positionMillis > 0 ? Math.min(positionMillis, durationMillis || positionMillis) : durationMillis || 0;
      const totalSec = watchedSecondsFromDurationMillis(actualWatchedMs);
      vpnBlocker.trace(`didJustFinish view=${viewId} watched=${totalSec}s pos=${positionMillis} dur=${durationMillis} -> complete-ad-view`);
      await finalizeAdView(viewId, totalSec);
    }
  }, []);

  const handleAdMediaError = useCallback(async (err: string) => {
    logger.error(TAG, "Erreur média publicité", err);
    setAdError(err);
    setLastError(err);
    clearLoadingTimer();
    if (networkModeRef.current === "android_vpn_demo") {
      await vpnBlocker.blockNow();
    }
  }, []);

  // ————————————————————————————————————————————————————————
  // Consentement VPN
  // ————————————————————————————————————————————————————————
  const requestVpnConsent = useCallback(async (): Promise<boolean> => {
    const res = await vpnBlocker.requestConsent();
    if (res.granted) {
      await vpnBlocker.startBlocking();
      const status = await vpnBlocker.getStatus();
      updateVpnStatus(status);
      return true;
    }
    const status = await vpnBlocker.getStatus();
    updateVpnStatus(status);
    return false;
  }, [updateVpnStatus]);

  // ————————————————————————————————————————————————————————
  // Revalidation serveur au retour de pause / premier plan.
  // On RE-VÉRIFIE la session + le quota côté serveur avant d'autoriser
  // le réseau (jamais d'autorisation native aveugle après une pause).
  // ————————————————————————————————————————————————————————
  const resumeFromPaused = useCallback(async () => {
    // La reprise est OBSERVABLE (isResuming → indicateur UI) et idempotente :
    // un double appel (double appui, retour premier plan + appui) est ignoré
    // via un verrou SYNCHRONE, avant même la porte de flux.
    if (resumingRef.current) return;
    resumingRef.current = true;
    setIsResuming(true);
    const gen = epochGuard.current;
    vpnBlocker.trace("resume-from-paused enter");
    try {
      // Porte de flux : un seul établissement à la fois. Un begin() null avec
      // l'état « paused » signale un flux ZOMBIE (essai précédent jamais
      // refermé) : on le libère et on repart proprement, au lieu de rester
      // bloqué sans fin sur « Autorisation en cours » (cause du BUG 1 v5).
      let flow = flowGate.begin();
      if (!flow) {
        vpnBlocker.trace("resume-from-paused stale-flow detected -> forceClose + retry");
        flowGate.forceClose();
        flow = flowGate.begin();
        if (!flow) return;
      }
      try {
        const st = await fetchQuotaStatus(defaultSiteId ?? null);
        if (!epochGuard.isCurrent(gen)) return; // suspension pendant la requête

        const a = st.allocation;
        if (resumeQuotaDecision(a) !== "ok") {
          // Quota indisponible/épuisé : aucun accès sans preuve serveur.
          await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
          setLastError("Quota épuisé.");
          return;
        }

        if (networkModeRef.current === "android_vpn_demo") {
          // La publicité doit rester visible avant TOUTE réactivation native
          // (contrat démo « pub visible pendant l'accès »). Si aucune campagne
          // n'est chargée, on en recharge une : sans campagne, PAS de reprise.
          let campaign = currentAd;
          if (!campaign) {
            const available = await getAvailableCampaign();
            if (!epochGuard.isCurrent(gen)) return;
            if (available.reason !== "available" || !available.campaign) {
              await suspendInto("paused", undefined, "cut");
              setLastError(
                available.errorMessage ?? "Aucune publicité disponible : la session reste en pause."
              );
              return;
            }
            campaign = available.campaign;
            setCurrentAd(campaign);
          }

          const siteId = defaultSiteId;
          // Jeton PERSISTÉ par utilisateur : une pause ou un redémarrage ne
          // peut pas créer involontairement une NOUVELLE session serveur.
          let sessionToken = sessionTokenRef.current;
          if (!sessionToken) {
            sessionToken = uuidV4();
            await persistSessionToken(sessionToken);
          }
          const req = await requestDemoWifiSession({ siteId, sessionToken });
          if (!epochGuard.isCurrent(gen)) return;
          vpnBlocker.trace(
            `resume-from-paused server-check ok=${req.ok} sessionId=${req.sessionId ?? "-"} status=${req.status ?? "-"} auth=${req.authorizationState ?? "-"} reason=${req.reason ?? "-"}`
          );
          if (!req.ok || !req.sessionId) {
            const verdict = resumeFailureAction(req.reason);
            if (verdict === "quota_exhausted") {
              await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
              setLastError("Quota épuisé.");
            } else if (verdict === "to_idle") {
              await suspendInto("idle", "HEARTBEAT_TIMEOUT");
              setLastError("Session expirée ou fermée côté serveur.");
            } else {
              // Panne TRANSITOIRE : l'état « en pause » est conservé (réessai
              // possible) et l'erreur est affichée. Jamais d'échec muet.
              await suspendInto("paused", undefined, "cut");
              setLastError(
                "La reprise a échoué (réseau ou serveur indisponible). Réessayez."
              );
            }
            return;
          }
          sessionRef.current = req.sessionId;
          setActiveSession({
            id: req.sessionId,
            status: "active",
            routerSessionReference: "vpn-demo-local",
          });

          // Autorisation native dérivée des DATES SERVEUR uniquement. Aucun
          // repli local : une échéance inexploitable bloque (jamais 25 s auto).
          const auth = serverTtlDecision(req.heartbeatExpiresAt);
          if (auth.action !== "authorize") {
            vpnBlocker.trace(`resume-from-paused EXPIRY-UNUSABLE until=${req.heartbeatExpiresAt ?? "-"} -> block`);
            await suspendInto("idle", "HEARTBEAT_TIMEOUT");
            setLastError("Session expirée: échéance serveur inutilisable.");
            return;
          }
          const authRes = await vpnBlocker.setAuthorized(auth.ttlMs);
          if (!epochGuard.isCurrent(gen)) {
            await vpnBlocker.blockNow();
            return;
          }
          vpnBlocker.trace(`resume-from-paused setAuthorized ok=${authRes.ok} gen=${authRes.generation}`);
          if (authRes.ok) {
            refreshUsage();
            transition(ACTIONS.RESUME);
            setInternetStatus("active");
            return;
          }
          await suspendInto("error", "ROUTER_ERROR", "cut");
          setLastError("Échec d'activation du VPN natif");
          return;
        }

        // Mode MikroTik : le serveur est l'autorité pour la reprise.
        const signal = signalFromServer(st.session);
        if (signal.mode === "active") {
          if (!epochGuard.isCurrent(gen)) return;
          transition(ACTIONS.RESUME);
          setInternetStatus("active");
          return;
        }
        if (signal.mode === "quota_exhausted") {
          await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
          setLastError("Quota épuisé.");
          return;
        }
        // Session fermée/expirée/indéterminée : une autorisation vérifiée
        // (nouvelle publicité) est obligatoire.
        await suspendInto("idle", "HEARTBEAT_TIMEOUT");
        setLastError("Session expirée ou fermée côté serveur.");
      } finally {
        flowGate.end(flow);
      }
    } catch (e: any) {
      logger.warn(TAG, "Reprise impossible", e);
      if (epochGuard.isCurrent(gen)) {
        // Panne inattendue : on RESTE en pause (réessai possible), l'erreur
        // est affichée. Ni maintien silencieux, ni perte de l'état « paused ».
        await suspendInto("paused", undefined, "cut");
        setLastError("La reprise a échoué. Réessayez.");
      }
    } finally {
      resumingRef.current = false;
      setIsResuming(false);
    }
  }, [
    fetchQuotaStatus,
    defaultSiteId,
    refreshUsage,
    suspendInto,
    serverTtlDecision,
    epochGuard,
    flowGate,
    currentAd,
    persistSessionToken,
    transition,
  ]);

  resumeFromPausedRef.current = resumeFromPaused;

  // ————————————————————————————————————————————————————————
  // Connexion : publicité obligatoire puis session Wi-Fi.
  // ————————————————————————————————————————————————————————
  const connect = useCallback(async () => {
    if (!user) return;
    const s = stateRef.current;
    if (
      s !== "idle" &&
      s !== "quota_exhausted" &&
      s !== "error" &&
      s !== "paused" &&
      s !== "authorizing_wifi"
    ) {
      return;
    }

    if (s === "paused") {
      await resumeFromPaused();
      return;
    }

    if (s === "authorizing_wifi") {
      // Cul-de-sac observé sur device : une autorisation demeurée sans
      // aboutissement ne quitte jamais cet état, ce qui verrouille
      // connect() et laisse l'écran « Autorisation Wi-Fi » figé. On
      // repart de zéro (état + contrôle natif) avant de relancer.
      logger.info(TAG, "Reprise depuis authorizing_wifi : réinitialisation de l'état");
      epochGuard.advance();
      flowGate.forceClose();
      vpnBlocker.blockNow().catch(() => {});
      setDisconnectReason(undefined);
      setInternetStatus("cut");
      setState("idle");
    }

    // Une seule session en cours d'établissement à la fois : un double
    // appui est ignoré (idempotence au niveau du déclencheur).
    const flow = flowGate.begin();
    if (!flow) {
      logger.warn(TAG, "Connexion déjà en cours, requête ignorée");
      return;
    }
    const gen = epochGuard.current;
    try {
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
        if (!epochGuard.isCurrent(gen)) return;
      }

      transition(ACTIONS.CONNECT);
      setInternetStatus("cut");
      setDisconnectReason(undefined);

      const health = await networkAdapter.healthCheck();
      setNetworkHealth(health);
      if (!epochGuard.isCurrent(gen)) return; // arrière-plan pendant la préparation

      let campaignToUse = currentAd;
      if (!campaignToUse) {
        const available = await getAvailableCampaign();
        if (!epochGuard.isCurrent(gen)) return;
        if (available.reason !== "available" || !available.campaign) {
          setCurrentAd(null);
          setLastError(available.errorMessage ?? "Aucune campagne disponible");
          setState("idle");
          return;
        }
        campaignToUse = available.campaign;
        setCurrentAd(campaignToUse);
      }

      setLastError(null);
      setAdError(null);

      const started = await startAdView(campaignToUse.id);
      if (!epochGuard.isCurrent(gen)) {
        // Session suspendue pendant la préparation : la publicité éventuelle
        // est soldée sans récompense, sinon elle resterait « en vol ».
        if (started) await completeAdView(started.viewId, 0).catch(() => {});
        return;
      }
      if (!started) {
        setCurrentAd(null);
        setLastError("Impossible d'initialiser la session de visionnage publicitaire");
        setState("idle");
        return;
      }

      viewingRef.current = { viewId: started.viewId, campaignId: campaignToUse.id };
      // Nouveau VISIONNAGE : la clé du lecteur (campagne:nonce) change, ce qui
      // force un remontage à neuf — le lecteur expo-av rejouera depuis le
      // début et didJustFinish redeviendra fiable même pour la même campagne.
      setAdViewNonce((n) => n + 1);
      vpnBlocker.trace(`start-ad-view id=${started.viewId} campaign=${campaignToUse.id} dur=${campaignToUse.durationSeconds}`);
      startLoadingTimer();
      transition(ACTIONS.AD_AVAILABLE);
      // Le lecteur vidéo déclenchera les événements réels via handlePlaybackStatusUpdate
    } catch (e: any) {
      logger.warn(TAG, "Connexion impossible", e);
      if (epochGuard.isCurrent(gen)) {
        setCurrentAd(null);
        setLastError(e?.message ?? "Erreur de connexion");
        setInternetStatus("cut");
        setState("idle");
      }
    } finally {
      flowGate.end(flow);
    }
  }, [user, transition, networkAdapter, networkMode, requestVpnConsent, currentAd, resumeFromPaused, flowGate, epochGuard]);

  // ————————————————————————————————————————————————————————
  // Fin de publicité : validation et établissement session
  // ————————————————————————————————————————————————————————
  async function finalizeAdView(viewId: string, watchedSeconds: number) {
    // Idempotence : une publicité déjà finalisée/annulée est ignorée.
    if (!viewingRef.current || viewingRef.current.viewId !== viewId) {
      return;
    }
    // Marque finalisée AVANT les appels réseau : aucune entrée concurrente
    // ne peut décompter deux fois la même pub ni réactiver la session.
    viewingRef.current = null;
    const gen = epochGuard.current;

    const result = await completeAdView(viewId, watchedSeconds);
    if (!epochGuard.isCurrent(gen)) return; // session suspendue/expirée en cours de route
    setAdIsPlaying(false);
    vpnBlocker.trace(`complete-ad-view view=${viewId} watched=${watchedSeconds}s success=${result.success} reward=${result.rewardGranted} reason=${result.reason ?? "-"}`);

    if (!result.success || !result.rewardGranted) {
      setAdProgress(0);
      setLastError(result.reason ? `Échec validation publicité: ${result.reason}` : "Publicité non validée");
      await suspendInto("idle");
      return;
    }

    // Jeton PERSISTÉ par utilisateur : le token créé ici sert aussi à la
    // reprise après une pause/redémarrage (aucune session involontaire).
    let sessionToken = sessionTokenRef.current;
    if (!sessionToken) {
      sessionToken = uuidV4();
      await persistSessionToken(sessionToken);
    }
    const siteId = defaultSiteId;
    const isVpnDemo = networkModeRef.current === "android_vpn_demo";

    if (isVpnDemo) {
      const req = await requestDemoWifiSession({
        siteId,
        sessionToken,
      });
      if (!epochGuard.isCurrent(gen)) return;
      vpnBlocker.trace(`request_demo_wifi_session ok=${req.ok} outcome=${req.outcome ?? "-"} sessionId=${req.sessionId ?? "-"} status=${req.status ?? "-"} auth=${req.authorizationState ?? "-"} reason=${req.reason ?? "-"}`);

      if (!req.ok) {
        if (req.outcome === "quota_exhausted" || req.reason === "quota_exhausted") {
          await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
          setLastError("Quota épuisé.");
        } else {
          await suspendInto("idle", "ROUTER_ERROR");
          setLastError(req.reason ? `Erreur session: ${req.reason}` : "Session refusée");
        }
        return;
      }

      if (req.sessionId) {
        sessionRef.current = req.sessionId;
        setActiveSession({ id: req.sessionId, status: "active", routerSessionReference: "vpn-demo-local" });
      }

      // Autorisation native dérivée des DATES SERVEUR uniquement. Si le
      // serveur ne fournit pas d'échéance exploitable → blocage (pas d'accès).
      const auth = serverTtlDecision(req.heartbeatExpiresAt);
      if (auth.action !== "authorize") {
        vpnBlocker.trace(`finalize EXPIRY-UNUSABLE until=${req.heartbeatExpiresAt ?? "-"} -> block`);
        await suspendInto("idle", "HEARTBEAT_TIMEOUT");
        setLastError("Session expirée: échéance serveur inutilisable.");
        return;
      }
      const native = await vpnBlocker.setAuthorized(auth.ttlMs);
      if (!epochGuard.isCurrent(gen)) {
        await vpnBlocker.blockNow();
        return;
      }
      if (native.ok) {
        transition(ACTIONS.SESSION_AUTHORIZED);
        setInternetStatus("active");
        setState("wifi_active");
        // En mode démo, on GARDE la publicité à l'écran (visible + en lecture)
        // pour maintenir l'accès, conformément au contrat démo.
        // setCurrentAd(null) est volontairement omis ici.
        refreshUsage();
      } else {
        await suspendInto("error", "ROUTER_ERROR", "cut");
        setLastError("Échec d'activation du VPN natif");
      }
      return;
    }

    // Mode MikroTik normal
    const req = await requestWifiSession({
      siteId,
      sessionToken,
      deviceObservedIp: undefined,
    });
    if (!epochGuard.isCurrent(gen)) return;

    if (!req.ok) {
      if (req.outcome === "quota_exhausted" || req.reason === "quota_exhausted") {
        await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
        setLastError("Quota épuisé.");
      } else {
        await suspendInto("idle", "ROUTER_ERROR");
        setLastError(req.reason ? `Erreur session: ${req.reason}` : "Session refusée");
      }
      return;
    }

    if (req.sessionId) {
      sessionRef.current = req.sessionId;
      setActiveSession({ id: req.sessionId, status: "authorized" });
    }
    transition(ACTIONS.AD_WATCHED);

    const verdict = await waitForAuthorization(siteId, gen);
    if (disposedRef.current || !epochGuard.isCurrent(gen)) return;

    if (verdict.ok) {
      transition(ACTIONS.SESSION_AUTHORIZED);
      setInternetStatus("active");
      refreshUsage();
    } else if (verdict.exhausted) {
      await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
    } else {
      await suspendInto("error", "ROUTER_ERROR", "cut");
      setLastError("Autorisation routeur non confirmée dans le délai");
    }
  }

  async function waitForAuthorization(
    siteId?: string,
    gen?: number
  ): Promise<{ ok: boolean; exhausted?: boolean; interrupted?: boolean }> {
    const result = await waitForMikrotikAuthorization({
      fetchStatus: () => fetchQuotaStatus(siteId ?? null),
      timeoutMs: AUTHORIZE_TIMEOUT_MS,
      isCancelled: () => (gen !== undefined && !epochGuard.isCurrent(gen)) || disposedRef.current,
      onPoll: (st) => {
        refreshUsageFrom(st);
        setActiveSession(serverSessionToWifi(st.session));
      },
    });
    return {
      ok: result.ok,
      exhausted: result.signal?.mode === "quota_exhausted",
      interrupted: result.interrupted,
    };
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
          // Coupe native + état dédié (suspendInto est idempotent ici).
          await suspendInto("quota_exhausted", "QUOTA_EXHAUSTED");
        }
      }
    },
    [refreshUsage, suspendInto]
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
    // Le jeton démo persiste uniquement pour un MODE démo : hors mode démo,
    // il n'a plus de sens (la session serveur associée reste en pause).
    await clearPersistedSessionToken();
    // Invalide toute réponse démo encore en vol et referme les flux.
    epochGuard.advance();
    flowGate.forceClose();
    controlFailuresRef.current = 0;
    setInternetStatus("cut");
    setState("idle");
    setDisconnectReason(undefined);
    setNetworkModeState("mikrotik");
  }, [epochGuard, flowGate, clearPersistedSessionToken]);

  // ————————————————————————————————————————————————————————
  // Pause de session : la publicité est mise en pause, le trafic
  // est immédiatement bloqué, mais la session serveur reste vivante.
  // ————————————————————————————————————————————————————————
  const pauseSession = useCallback(async () => {
    if (stateRef.current !== "wifi_active") return;
    clearLoadingTimer();
    vpnBlocker.trace("pauseSession -> guard advance + block + invalidate generation");
    // suspendInto : époque avancée (toute réponse en vol est invalidée),
    // gate fermée, blocage et invalidation natifs (démo), trafic coupé.
    await suspendInto("paused");
    setAdIsPlaying(false);
  }, [clearLoadingTimer, suspendInto]);

  // ————————————————————————————————————————————————————————
  // Déconnexion manuelle.
  // ————————————————————————————————————————————————————————
  const disconnect = useCallback(async () => {
    const sessionId = sessionRef.current;
    clearLoadingTimer();
    transition(ACTIONS.DISCONNECT);
    // suspendInto : invalide réponses en vol, ferme les flux, coupe natif
    // (démo) et libère la référence de session locale.
    await suspendInto("idle", undefined, "cut", { clearSession: true });
    if (sessionId) {
      try {
        await endWifiSession(sessionId, "USER_PAUSED_AD");
      } catch (e) {
        logger.warn(TAG, "Fin de session impossible", e);
      }
    }
    // La session serveur est réellement terminée : le jeton persisté ne
    // doit pas être réutilisé pour une reprise future (nouvelle session).
    await clearPersistedSessionToken();
    setAdProgress(0);
    setAdIsPlaying(false);
    transition(ACTIONS.DISCONNECTED);
  }, [transition, clearLoadingTimer, suspendInto, clearPersistedSessionToken]);

  const refillQuota = useCallback(async () => {
    const st = await fetchQuotaStatus(defaultSiteId ?? null);
    if (disposedRef.current) return;
    const a = st.allocation;
    if (resumeQuotaDecision(a) === "ok") {
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
      adIsPlaying,
      adBuffering,
      adError,
      lastError,
      networkHealth,
      networkProviderKind: networkAdapter.providerKind,
      currentAd,
      lastSyncAt,
      networkMode,
      vpnStatus,
      isResuming,
      adViewNonce,
      renewNow,
      setNetworkMode,
      requestVpnConsent,
      consumeSimulatedBytes,
      resetDemoAllocation,
      exitDemoMode,
      connect,
      disconnect,
      pauseSession,
      refillQuota,
      handlePlaybackStatusUpdate,
      handleAdMediaError,
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
      adIsPlaying,
      adBuffering,
      adError,
      lastError,
      networkHealth,
      networkAdapter,
      currentAd,
      lastSyncAt,
      networkMode,
      vpnStatus,
      isResuming,
      adViewNonce,
      renewNow,
      setNetworkMode,
      requestVpnConsent,
      consumeSimulatedBytes,
      resetDemoAllocation,
      exitDemoMode,
      connect,
      disconnect,
      pauseSession,
      refillQuota,
      handlePlaybackStatusUpdate,
      handleAdMediaError,
    ]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}