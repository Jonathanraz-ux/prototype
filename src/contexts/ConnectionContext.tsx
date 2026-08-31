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
  fetchUsage,
  getActiveSession,
  requestWifiSession,
  endWifiSession,
} from "../repositories/sessionRepository";
import {
  getAvailableCampaign,
  startAdView,
  completeAdView,
} from "../repositories/adRepository";
import type { AdCampaign } from "../types";
import { registerDevice } from "../repositories/deviceRepository";
import { resolveNetworkAdapter } from "../network";
import { isDevelopment } from "../lib/config";
import { logger } from "../lib/logger";
import {
  canTransition,
  getDisconnectReason,
  CONNECTION_ACTIONS as ACTIONS,
  STATE_LABELS,
  REASON_LABELS,
} from "../services/connectionMachine";

const TAG = "conn";

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
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refillQuota: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ConnectionState>("deconnected");
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
  const appStateRef = useRef(AppState.currentState);
  const viewingRef = useRef<{ viewId: string; campaignId: string } | null>(null);

  const networkAdapter = useMemo(() => resolveNetworkAdapter(), []);

  const transition = useCallback((action: string) => {
    setState((prev) => {
      const next = canTransition(prev, action);
      if (!next) return prev;
      const reason = getDisconnectReason(prev, action);
      if (reason) setDisconnectReason(reason);
      return next;
    });
  }, []);

  // Mettre à jour le quota réellement disponible depuis le serveur.
  const refreshUsage = useCallback(async () => {
    const { remainingSeconds, remainingBytes } = await fetchUsage();
    setUsage({
      remainingQuotaMB: Math.round(remainingBytes / (1024 * 1024)),
      totalQuotaMB: Math.round(remainingBytes / (1024 * 1024)),
      remainingTimeMinutes: Math.round(remainingSeconds / 60),
      totalTimeMinutes: Math.round(remainingSeconds / 60),
      todayConsumptionMB: 0,
    });
  }, []);

  // Restaurer la session active au montage / connexion utilisateur.
  useEffect(() => {
    if (!user) return;
    registerDevice().then((r) => logger.info(TAG, "Device enregistré", r.status));
    getActiveSession().then((session) => {
      setActiveSession(session);
      if (session && (session.status === "authorized" || session.status === "active")) {
        setState("connected");
        setInternetStatus("active");
      }
    });
    refreshUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Détection de mise en arrière-plan : invalide la lecture publicitaire.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (
        appStateRef.current === "active" &&
        next !== "active" &&
        (state === "ad_found" || state === "connecting")
      ) {
        invalidateAdView();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function invalidateAdView() {
    if (viewingRef.current) {
      const { viewId } = viewingRef.current;
      await completeAdView(viewId, 0); // watched < min => rejeté côté serveur
      viewingRef.current = null;
    }
    setAdProgress(0);
    transition(ACTIONS.AD_MISSING);
    setInternetStatus("cut");
  }

  /**
   * Connexion : vérifie la licence/le réseau, récupère une campagne,
   * lance la lecture publicitaire obligatoire.
   */
  const connect = useCallback(async () => {
    if (state === "ad_missing" || state === "network_error" || state === "suspended") {
      transition(ACTIONS.RESET);
    }
    transition(ACTIONS.CONNECT);

    try {
      const health = await networkAdapter.healthCheck();
      setNetworkHealth(health);

      // Récupérer une campagne disponible via Edge Function
      const available = await getAvailableCampaign();
      if (available.reason !== "available" || !available.campaign) {
        setState((prev) => (prev === "connecting" ? "ad_missing" : prev));
        setInternetStatus("cut");
        transition(ACTIONS.AD_MISSING);
        return;
      }
      setCurrentAd(available.campaign);

      transition(ACTIONS.CONNECT_SUCCESS);
      setState("ad_found");

      // Démarrage de la vue publicitaire côté serveur (nonce)
      const started = await startAdView(available.campaign.id);
      if (!started) {
        setState((prev) => (prev === "ad_found" ? "ad_missing" : prev));
        transition(ACTIONS.AD_MISSING);
        return;
      }
      viewingRef.current = { viewId: started.viewId, campaignId: available.campaign.id };

      // Progression locale (l'accord de la récompense reste côté serveur)
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

      void tick;
    } catch (e) {
      logger.warn(TAG, "Connexion impossible", e);
      transition(ACTIONS.CONNECT_FAIL);
      setInternetStatus("cut");
    }
  }, [state, transition, networkAdapter]);

  async function finalizeAdView(viewId: string, watchedSeconds: number) {
    const result = await completeAdView(viewId, watchedSeconds);
    viewingRef.current = null;
    setCurrentAd(null);

    if (!result.success || !result.rewardGranted) {
      setAdProgress(0);
      transition(ACTIONS.AD_MISSING);
      return;
    }

    // Créer la session Wi-Fi via Edge Function (récompense déjà accordée)
    const sessionResult = await requestWifiSession({
      siteId: process.env.EXPO_PUBLIC_DEFAULT_SITE_ID,
      routerId: undefined,
      adViewId: viewId,
    });

    if (!sessionResult.ok) {
      transition(ACTIONS.AD_MISSING);
      return;
    }

    setActiveSession((prev) => ({ ...(prev ?? ({} as WifiSession)), id: sessionResult.sessionId! }));
    setInternetStatus("active");
    setState("connected");
    refreshUsage();

    // Autoriser la session auprès de l'adaptateur réseau
    if (sessionResult.sessionId) {
      await networkAdapter.authorizeSession({
        username: user?.email ?? "",
        allocatedSeconds: Math.round(usage.remainingTimeMinutes * 60),
        allocatedBytes: 0,
        networkSessionReference: sessionResult.sessionId,
      });
    }
  }

  /**
   * Déconnexion manuelle.
   */
  const disconnect = useCallback(async () => {
    if (activeSession?.id) {
      await endWifiSession(activeSession.id);
    }
    if (activeSession?.networkSessionReference) {
      await networkAdapter.disconnectSession(activeSession.networkSessionReference);
    }
    setActiveSession(null);
    setInternetStatus("cut");
    setAdProgress(0);
    transition(ACTIONS.LOGOUT);
  }, [activeSession, networkAdapter, transition]);

  const refillQuota = useCallback(() => {
    // En mode réel, la recharge passe obligatoirement par une publicité.
    transition(ACTIONS.RESET);
    setDisconnectReason(undefined);
  }, [transition]);

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
      connect,
      disconnect,
      refillQuota,
    }),
    [state, internetStatus, usage, stateLabel, disconnectReason, reasonLabel, activeSession, adProgress, networkHealth, currentAd, connect, disconnect, refillQuota]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
