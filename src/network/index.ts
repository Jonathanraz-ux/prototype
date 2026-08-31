import { isDevelopment } from "../lib/config";
import { logger } from "../lib/logger";
import type { NetworkAccessAdapter, NetworkHealth } from "./NetworkAccessAdapter";
import { DevelopmentNetworkAdapter } from "./DevelopmentNetworkAdapter";
import { RadiusNetworkAdapter } from "./RadiusNetworkAdapter";
import { MikrotikNetworkAdapter } from "./MikrotikNetworkAdapter";

const TAG = "net:factory";

/**
 * Résout l'adaptateur réseau selon le type configuré.
 *
 * - development : uniquement en dev (lévé en production)
 * - radius : pilote FreeRADIUS côté serveur
 * - mikrotik : pilote MikroTik côté serveur
 *
 * En pilote/production sans configuration, on instancie un adaptateur
 * qui renverra systématiquement l'état explicite NOT_CONFIGURED.
 */
export function resolveNetworkAdapter(): NetworkAccessAdapter {
  const adapterType = process.env.NETWORK_ADAPTER_TYPE ?? (isDevelopment() ? "development" : "not_configured");

  switch (adapterType) {
    case "development":
      if (!isDevelopment()) {
        logger.error(TAG, "Adaptateur development interdit hors développement.");
        return new UnconfiguredAdapter();
      }
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
