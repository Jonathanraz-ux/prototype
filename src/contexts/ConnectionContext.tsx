import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ConnectionState, InternetStatus, DisconnectReason, UsageStats } from "../types";
import { MikrotikService } from "../services/mikrotik";
import { QuotaService } from "../services/quota";
import { AdService } from "../services/ads";
import { InternetService } from "../services/internet";
import {
  canTransition,
  getDisconnectReason,
  CONNECTION_ACTIONS as ACTIONS,
  STATE_LABELS,
  REASON_LABELS
} from "../services/connectionMachine";

export interface ConnectionContextValue {
  state: ConnectionState;
  internetStatus: InternetStatus;
  usage: UsageStats;
  stateLabel: string;
  disconnectReason: DisconnectReason | undefined;
  reasonLabel: string | undefined;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refillQuota: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConnectionState>("deconnected");
  const [internetStatus, setInternetStatus] = useState<InternetStatus>("cut");
  const [usage, setUsage] = useState<UsageStats>(QuotaService.getUsage());
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason | undefined>();
  const usageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const transition = useCallback((action: string) => {
    setState((prev) => {
      const next = canTransition(prev, action);
      if (!next) return prev;
      const reason = getDisconnectReason(prev, action);
      if (reason) setDisconnectReason(reason);
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    transition(ACTIONS.CONNECT);
    try {
      await MikrotikService.login("jean.dupont@email.com", "demo1234");
      await MikrotikService.startSession("jean.dupont@email.com");
      transition(ACTIONS.CONNECT_SUCCESS);
      transition(ACTIONS.AD_FOUND);
      InternetService.activate();
      setInternetStatus("active");

      QuotaService.startConsumption((updated) => {
        setUsage(updated);
        if (updated.remainingQuotaMB <= 0 || updated.remainingTimeMinutes <= 0) {
          transition(ACTIONS.QUOTA_EXHAUSTED);
          QuotaService.stopConsumption();
          InternetService.cut();
          setInternetStatus("cut");
          QuotaService.addHistoryEntry("quota_exhausted");
        }
      });
    } catch {
      transition(ACTIONS.CONNECT_FAIL);
      InternetService.cut();
      setInternetStatus("cut");
    }
  }, [transition]);

  const disconnect = useCallback(async () => {
    await MikrotikService.disconnect("user_disconnected");
    await MikrotikService.stopSession();
    InternetService.cut();
    setInternetStatus("cut");
    QuotaService.stopConsumption();
    QuotaService.addHistoryEntry("user_disconnected");
    transition(ACTIONS.LOGOUT);
  }, [transition]);

  const refillQuota = useCallback(() => {
    QuotaService.refillQuota();
    setUsage(QuotaService.getUsage());
  }, []);

  useEffect(() => {
    const unsubAd = AdService.onAdVisibilityChange((visible) => {
      if (state === "connected" || state === "ad_found") {
        if (!visible) {
          transition(ACTIONS.AD_MISSING);
          InternetService.cut();
          setInternetStatus("cut");
          QuotaService.stopConsumption();
          QuotaService.addHistoryEntry("ad_closed");
        }
      }
    });

    const unsubInternet = InternetService.onStatusChange((status) => {
      setInternetStatus(status);
    });

    return () => {
      unsubAd();
      unsubInternet();
    };
  }, [state, transition]);

  const stateLabel = STATE_LABELS[state];
  const reasonLabel = disconnectReason ? REASON_LABELS[disconnectReason] : undefined;

  return (
    <ConnectionContext.Provider
      value={{
        state,
        internetStatus,
        usage,
        stateLabel,
        disconnectReason,
        reasonLabel,
        connect,
        disconnect,
        refillQuota
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
