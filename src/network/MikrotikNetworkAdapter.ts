import { logger } from "../lib/logger";
import { waitForMikrotikAuthorization } from "../lib/mikrotikAuth";
import {
  requestWifiSession,
  endWifiSession,
  fetchQuotaStatus,
} from "../repositories/sessionRepository";
import { quotaConsumedBytes } from "../lib/sessionControl";
import { getConfig } from "../lib/config";
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
 * Détail enrichi de la santé MikroTik (au-delà de NetworkHealth brut).
 * Exposé via `healthCheckDetail()` pour que l'UI puisse indiquer si
 * l'agent est en ligne, combien de routeurs sont connus, ou si le
 * mode est simulé (agent mock).
 */
export interface MikrotikHealthDetail {
  health: NetworkHealth;
  configured: boolean;
  adapterType?: string | null;
  agentsOnline?: number;
  routers?: number;
  routerOnline?: boolean;
  simulated?: boolean;
}

/**
 * MikrotikNetworkAdapter — Fournisseur réseau RÉEL (kind = "live").
 *
 * Aucun identifiant MikroTik n'est stocké côté téléphone : tout
 * passe par la chaîne serveur (Edge Functions + agent local).
 *
 * La chaîne utilisée est :
 *   1. healthCheck    → network-health
 *   2. authorizeSession → requestWifiSession → waitForMikrotikAuthorization
 *      (scrutation quota-status jusqu'à confirmation serveur active)
 *   3. getSessionUsage → quota-status (allocations + compteurs routeur)
 *   4. disconnectSession → end-wifi-session (enfile commande disconnect
 *      côté serveur, consommée par l'agent)
 *
 * Ne prétend JAMAIS une connexion réussie sans confirmation serveur
 * explicite. Si le routeur/agent est injoignable, attend ou échoue
 * explicitement.
 */
export class MikrotikNetworkAdapter implements NetworkAccessAdapter {
  readonly name = "mikrotik";
  readonly providerKind = "live" as const;

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

  /**
   * Santé détaillée (agents/routeurs/simulé) — exposée en UI pour
   * aider le testeur à vérifier que la chaîne est prête.
   */
  async healthCheckDetail(): Promise<MikrotikHealthDetail> {
    try {
      const res = await callFunction<{
        health: NetworkHealth;
        configured: boolean;
        adapterType?: string | null;
        agentOnline?: boolean;
        routerOnline?: boolean;
        agents?: Array<Record<string, unknown>>;
        routers?: Array<Record<string, unknown>>;
        simulated?: boolean;
      }>("network-health", { adapter: "mikrotik" });

      if (!res.ok) return { health: "ERROR", configured: false };
      const d = res.data;
      return {
        health: d.health ?? "ERROR",
        configured: d.configured ?? false,
        adapterType: d.adapterType,
        agentsOnline: d.agents?.filter((a) => a.status === "online").length ?? 0,
        routers: d.routers?.length ?? 0,
        routerOnline: d.routerOnline ?? false,
        simulated: d.simulated ?? false,
      };
    } catch {
      return { health: "UNREACHABLE", configured: false };
    }
  }

  async authorizeSession(input: AuthorizeSessionInput): Promise<AuthorizeSessionResult> {
    try {
      const sessionToken =
        input.networkSessionReference ?? `mkt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // 1) Demande la session au serveur (SQL begin_network_session →
      //    enfile la commande authorize signée pour l'agent).
      const req = await requestWifiSession({
        siteId: input.siteId,
        routerId: input.routerId,
        sessionToken,
        deviceObservedIp: input.ipAddress,
      });

      if (!req.ok) {
        if (req.outcome === "quota_exhausted" || req.reason === "quota_exhausted") {
          return { success: false, health: "READY", reason: "quota_exhausted" };
        }
        return { success: false, health: "UNREACHABLE", reason: req.reason ?? "session_denied" };
      }

      if (!req.sessionId) {
        return { success: false, health: "ERROR", reason: "no_session_id" };
      }

      // 2) Attente de la confirmation serveur (l'agent exécute la commande
      //    sur le routeur puis pose router_session_reference sur la session).
      const verdict = await waitForMikrotikAuthorization({
        fetchStatus: () => fetchQuotaStatus(input.siteId ?? getConfig().EXPO_PUBLIC_DEFAULT_SITE_ID ?? null),
        timeoutMs: 15000,
      });

      if (verdict.ok) {
        return { success: true, reference: req.sessionId };
      }

      if (verdict.signal?.mode === "quota_exhausted") {
        return { success: false, health: "READY", reason: "quota_exhausted" };
      }
      return { success: false, health: "UNREACHABLE", reason: "router_not_confirmed" };
    } catch (e) {
      logger.warn(TAG, "authorizeSession impossible", e);
      return { success: false, health: "UNREACHABLE", reason: "network_error" };
    }
  }

  async getSessionUsage(reference: string): Promise<SessionUsage> {
    try {
      const st = await fetchQuotaStatus(getConfig().EXPO_PUBLIC_DEFAULT_SITE_ID ?? null);
      const session = st.session;
      const isActive = session?.session_id === reference && (session?.status === "active" || session?.status === "paused");
      const a = st.allocation;
      const quotaBytes = a?.quota_bytes ?? 0;
      const remainingBytes = Math.max(0, a?.remaining_bytes ?? quotaBytes);
      return {
        consumedBytes: quotaConsumedBytes(quotaBytes, remainingBytes),
        consumedSeconds: 0,
        available: isActive,
      };
    } catch (e) {
      logger.warn(TAG, "getSessionUsage impossible", e);
      return { consumedSeconds: 0, consumedBytes: 0, available: false };
    }
  }

  async disconnectSession(reference: string): Promise<void> {
    try {
      await endWifiSession(reference, "USER_PAUSED_AD");
    } catch (e) {
      logger.warn(TAG, "disconnectSession impossible", e);
    }
  }
}