import * as React from "react";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { NetworkTransport } from "../lib/browsePolicy";

const TAG = "net:transport";

/**
 * Détection du transport réseau actif de l'appareil (expo-network).
 *
 * Honnêteté des limites :
 *  - expo-network lit l'interface réseau active PAR DÉFAUT du système
 *    (ConnectivityManager). c'est un signal fiable du transport choisi
 *    par Android pour l'appareil.
 *  - Ce n'est PAS une preuve que chaque flux WebView transite par cette
 *    interface (pas de liaison de socket native par réseau dans ce MVP).
 *  - Un SSID n'est jamais considéré comme une identité sûre du réseau.
 */

export function hasNetworkModule(): boolean {
  return typeof Network?.getNetworkStateAsync === "function";
}

export async function getNetworkTransport(): Promise<NetworkTransport> {
  if (!hasNetworkModule()) {
    return "unknown";
  }
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return "none";
    switch (state.type) {
      case Network.NetworkStateType.WIFI:
        return "wifi";
      case Network.NetworkStateType.CELLULAR:
        return "cellular";
      default:
        return "unknown";
    }
  } catch (err) {
    if (__DEV__) {
      console.warn(`${TAG}: lecture transport impossible`, err);
    }
    return "unknown";
  }
}

/** Piste le transport réseau (activation + polling + retour premier plan). */
export function useNetworkTransport(intervalMs = 5000): NetworkTransport {
  const [transport, setTransport] = useState<NetworkTransport>("unknown");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const t = await getNetworkTransport();
      if (!cancelled) setTransport(t);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);

  return transport;
}