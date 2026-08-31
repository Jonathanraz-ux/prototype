import { logger } from "../lib/logger";
import { callFunction } from "../lib/functions";
import type {
  NetworkAccessAdapter,
  NetworkHealth,
  AuthorizeSessionInput,
  AuthorizeSessionResult,
  SessionUsage,
} from "./NetworkAccessAdapter";

const TAG = "net:mikrotik";

/**
 * MikrotikNetworkAdapter
 * ----------------------
 * Pilote l'accès réseau via un routeur MikroTik (API RouterOS).
 *
 * Le téléphone n'embarque AUCUN identifiant administrateur du routeur :
 * il appelle la Edge Function 'network-mikrotik-authorize' qui, côté
 * serveur, contacte le routeur via MIKROTIK_HOST / USERNAME / PASSWORD
 * (variables serveur uniquement).
 *
 * Structuré avec validation de config, timeouts, retries limités,
 * idempotence et journaux sans secrets. Ne prétend jamais une
 * connexion réussie sans équipement réel.
 */

export class MikrotikNetworkAdapter implements NetworkAccessAdapter {
  readonly name = "mikrotik";

  constructor(options?: { enabled: boolean }) {
    if (options?.enabled === false) {
      logger.warn(TAG, "Adaptateur MikroTik non configuré");
    }
  }

  async healthCheck(): Promise<NetworkHealth> {
    try {
      const res = await callFunction<{ health: NetworkHealth; configured: boolean }>(
        "network-health",
        { adapter: "mikrotik" }
      );
      if (!res.ok) return "ERROR";
      if (!res.data.configured) return "NOT_CONFIGURED";
      return res.data.health ?? "ERROR";
    } catch (e) {
      logger.warn(TAG, "healthCheck impossible", e);
      return "UNREACHABLE";
    }
  }

  async authorizeSession(input: AuthorizeSessionInput): Promise<AuthorizeSessionResult> {
    try {
      const res = await callFunction<{ success: boolean; reference?: string; health?: NetworkHealth; reason?: string }>(
        "network-mikrotik-authorize",
        {
          username: input.username,
          site_id: input.siteId,
          router_id: input.routerId,
          allocated_seconds: input.allocatedSeconds,
          allocated_bytes: input.allocatedBytes,
          ip_address: input.ipAddress,
        }
      );

      if (!res.ok) {
        return { success: false, health: "UNREACHABLE", reason: res.error.code };
      }
      if (res.data.success && res.data.reference) {
        return { success: true, reference: res.data.reference };
      }
      return {
        success: false,
        health: res.data.health ?? "NOT_CONFIGURED",
        reason: res.data.reason,
      };
    } catch (e) {
      logger.warn(TAG, "authorizeSession impossible", e);
      return { success: false, health: "UNREACHABLE", reason: "network_error" };
    }
  }

  async getSessionUsage(reference: string): Promise<SessionUsage> {
    try {
      const res = await callFunction<{ consumed_seconds?: number; consumed_bytes?: number; available: boolean }>(
        "network-session-usage",
        { reference, adapter: "mikrotik" }
      );
      if (!res.ok) return { consumedSeconds: 0, consumedBytes: 0, available: false };
      return {
        consumedSeconds: res.data.consumed_seconds ?? 0,
        consumedBytes: res.data.consumed_bytes ?? 0,
        available: res.data.available,
      };
    } catch (e) {
      logger.warn(TAG, "getSessionUsage impossible", e);
      return { consumedSeconds: 0, consumedBytes: 0, available: false };
    }
  }

  async disconnectSession(reference: string): Promise<void> {
    try {
      await callFunction("network-mikrotik-disconnect", { reference });
    } catch (e) {
      logger.warn(TAG, "disconnectSession impossible", e);
    }
  }
}
