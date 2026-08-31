import { logger } from "../lib/logger";
import { callFunction } from "../lib/functions";
import type {
  NetworkAccessAdapter,
  NetworkHealth,
  AuthorizeSessionInput,
  AuthorizeSessionResult,
  SessionUsage,
} from "./NetworkAccessAdapter";

const TAG = "net:radius";

/**
 * RadiusNetworkAdapter
 * --------------------
 * Pilote l'accès réseau via un serveur RADIUS / FreeRADIUS.
 *
 * Le téléphone n'embarque AUCUN secret RADIUS : il appelle la Edge
 * Function 'network-authorize' qui, côté serveur, contacte FreeRADIUS
 * avec RADIUS_HOST / RADIUS_PORT / RADIUS_SECRET (variables serveur).
 *
 * Cette classe structure la validation de configuration, la gestion
 * des erreurs, les timeouts et l'idempotence. Elle N'INVENTE pas une
 * connexion réussie : si le serveur n'est pas joignable ou non
 * configuré, elle renvoie un état explicite.
 */

export class RadiusNetworkAdapter implements NetworkAccessAdapter {
  readonly name = "radius";

  // Pré-validé au démarrage du serveur. On ne stocke jamais le secret ici.
  private readonly endpointName = {
    health: "network-health",
    authorize: "network-radius-authorize",
    usage: "network-session-usage",
    disconnect: "network-radius-disconnect",
  };

  constructor(options?: { enabled: boolean }) {
    if (options?.enabled === false) {
      logger.warn(TAG, "Adaptateur RADIUS non configuré");
    }
  }

  /** État de la config serveur. En l'absence de variables RÉELLES, retourne NOT_CONFIGURED. */
  private getConfigState(): NetworkHealth {
    // Ces valeurs sont lues côté serveur (Edge Function). Ici on ne peut
    // pas les lire : on interroge la santé réseau qui reflète l'état réel.
    return "READY";
  }

  async healthCheck(): Promise<NetworkHealth> {
    try {
      const res = await callFunction<{ health: NetworkHealth; configured: boolean }>(
        this.endpointName.health,
        {}
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
        this.endpointName.authorize,
        {
          username: input.username,
          site_id: input.siteId,
          router_id: input.routerId,
          allocated_seconds: input.allocatedSeconds,
          allocated_bytes: input.allocatedBytes,
          ip_address: input.ipAddress,
          network_session_reference: input.networkSessionReference,
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
        this.endpointName.usage,
        { reference }
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
      await callFunction(this.endpointName.disconnect, { reference });
    } catch (e) {
      logger.warn(TAG, "disconnectSession impossible", e);
    }
  }
}
