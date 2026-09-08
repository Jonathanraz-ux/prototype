import { isDevelopment } from "../lib/config";
import { logger } from "../lib/logger";
import type { NetworkAccessAdapter, NetworkHealth } from "./NetworkAccessAdapter";
import { DevelopmentNetworkAdapter } from "./DevelopmentNetworkAdapter";
import { RadiusNetworkAdapter } from "./RadiusNetworkAdapter";
import { MikrotikNetworkAdapter } from "./MikrotikNetworkAdapter";
import { AndroidVpnDemoAdapter } from "./AndroidVpnDemoAdapter";

export { AndroidVpnDemoAdapter } from "./AndroidVpnDemoAdapter";
export { DevelopmentNetworkAdapter } from "./DevelopmentNetworkAdapter";
export { MikrotikNetworkAdapter } from "./MikrotikNetworkAdapter";
export { RadiusNetworkAdapter } from "./RadiusNetworkAdapter";
export * from "./NetworkAccessAdapter";

const TAG = "net:factory";

export type NetworkMode = "mikrotik" | "android_vpn_demo" | "mock" | "radius" | "not_configured";

/**
 * Résout l'adaptateur réseau selon le mode demandé ou configuré.
 *
 * - android_vpn_demo : contrôle VPN local Android autonome (sans routeur physique)
 * - mikrotik          : pilote MikroTik via commandes serveur et agent local
 * - mock / development : mock local développement
 * - radius            : pilote FreeRADIUS
 * - not_configured    : adaptateur vide
 */
export function resolveNetworkAdapter(overrideMode?: string): NetworkAccessAdapter {
  const adapterType =
    overrideMode ??
    process.env.EXPO_PUBLIC_NETWORK_MODE ??
    process.env.NETWORK_ADAPTER_TYPE ??
    (isDevelopment() ? "development" : "not_configured");

  switch (adapterType) {
    case "android_vpn_demo":
      return new AndroidVpnDemoAdapter();
    case "mock":
    case "development":
      return new DevelopmentNetworkAdapter();
    case "radius":
      return new RadiusNetworkAdapter({ enabled: true });
    case "mikrotik":
      return new MikrotikNetworkAdapter({ enabled: true });
    case "not_configured":
    default:
      return new UnconfiguredAdapter();
  }
}

/**
 * Adaptateur "vide" renvoyant NOT_CONFIGURED : utilisé tant que les
 * données réseau réelles ne sont pas fournies. Ne simule rien.
 */
class UnconfiguredAdapter implements NetworkAccessAdapter {
  readonly name = "unconfigured";

  async healthCheck(): Promise<NetworkHealth> {
    return "NOT_CONFIGURED";
  }
  async authorizeSession() {
    return { success: false as const, health: "NOT_CONFIGURED" as const, reason: "NOT_CONFIGURED" };
  }
  async getSessionUsage() {
    return { consumedSeconds: 0, consumedBytes: 0, available: false };
  }
  async disconnectSession() {
    // no-op
  }
}
