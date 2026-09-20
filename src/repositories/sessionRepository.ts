import { getSupabase } from "../lib/supabase";
import { callFunction, callRpc, getApiToken } from "../lib/functions";
import { getConfig } from "../lib/config";
import { logger } from "../lib/logger";
import { DEMO_QUOTA_BYTES } from "../lib/sessionControl";
import type { WifiSession, SessionUsage, ConnectionHistoryItem } from "../types";

const TAG = "sessions";

// NOTE — Quota : la source de vérité est le SERVEUR (table allocations +
// allocations_status) et le RÉSEAU (compteurs routeur/MikroTik). Aucun
// état de quota n'est persisté ni consommé localement : le client relit
// toujours quota-status. DEMO_QUOTA_BYTES (5 GiB, octets explicites) est
// le montant harmonisé fourni au RPC serveur de réinitialisation.
// ————————————————————————————————————————————————————————————
// Formes serveur restituées par les Edge Functions (migration 0008)
// ————————————————————————————————————————————————————————————
export interface ServerAllocation {
  allocation_id?: string;
  user_id?: string;
  site_id?: string;
  quota_bytes?: number;
  consumed_bytes?: number;
  remaining_bytes?: number;
  status?: string;
  exhausted_at?: string | null;
}

export interface ServerSession {
  session_id?: string;
  site_id?: string;
  router_id?: string | null;
  status?: string;
  ad_state?: string;
  authorization_state?: string;
  started_at?: string;
  ended_at?: string | null;
  last_heartbeat_at?: string | null;
  heartbeat_expires_at?: string | null;
  bytes_in?: number;
  bytes_out?: number;
  bytes_total?: number;
  disconnect_reason?: string | null;
  router_session_reference?: string | null;
  device_observed_mac?: string | null;
  device_observed_ip?: string | null;
}

export interface QuotaStatusShape {
  server_time?: string;
  allocation?: ServerAllocation | null;
  session?: ServerSession | null;
}

/**
 * État quota + session active — SOURCE DE VÉRITÉ côté serveur
 * (Edge Function quota-status → public.get_quota_status). Les
 * allocations persistantes ne se recalculent jamais côté client.
 */
export async function fetchQuotaStatus(
  siteId?: string | null
): Promise<QuotaStatusShape> {
  let serverData: QuotaStatusShape | null = null;
  let serverOk = false;

  try {
    const res = await callFunction<QuotaStatusShape>("quota-status", { site_id: siteId ?? null });
    if (res.ok && res.data) {
      serverData = res.data;
      serverOk = true;
    } else {
      const msg = res.ok ? "Données vides" : res.error?.message ?? "Erreur inconnue";
      logger.warn(TAG, "quota-status not-ok", msg);
    }
  } catch (e) {
    logger.warn(TAG, "quota-status exception", e);
  }

  const hasValidAllocation =
    serverOk &&
    serverData?.allocation &&
    (serverData.allocation.quota_bytes ?? 0) > 0;

  if (hasValidAllocation) {
    return serverData!;
  }

  if (serverData) return serverData;
  logger.warn(TAG, "quota-status échoué");
  return {};
}

/**
 * Demande une session Wi-Fi via la Edge Function 'request-wifi-session'.
 * Le téléphone ne possède aucun secret : l'autorisation routeur est enfilée
 * comme commande signée consommée par l'agent local.
 */
export async function requestWifiSession(input: {
  siteId?: string;
  routerId?: string;
  sessionToken?: string;
  deviceObservedMac?: string;
  deviceObservedIp?: string;
}): Promise<{
  ok: boolean;
  outcome?: string;
  sessionId?: string;
  status?: string;
  authorizationState?: string;
  reason?: string;
}> {
  const res = await callFunction<Record<string, unknown>>("request-wifi-session", {
    site_id: input.siteId,
    router_id: input.routerId ?? null,
    session_token: input.sessionToken,
    device_observed_mac: input.deviceObservedMac ?? null,
    device_observed_ip: input.deviceObservedIp ?? null,
  });

  if (!res.ok) {
    return { ok: false, reason: res.error.code };
  }

  const d = res.data;
  const outcome = (d.outcome as string) ?? "unknown";
  const createOrResume = outcome === "created" || outcome === "resume";
  return {
    ok: createOrResume,
    outcome,
    sessionId: (d.session_id as string) ?? undefined,
    status: (d.status as string) ?? undefined,
    authorizationState: (d.authorization_state as string) ?? undefined,
    reason: createOrResume ? undefined : ((d.reason as string) ?? outcome),
  };
}

/**
 * Battement publicitaire — le serveur décide seul de l'état de la session.
 */
export async function adHeartbeat(sessionId: string): Promise<{
  outcome: string;
  server_time?: string;
  last_heartbeat_at?: string;
  heartbeat_expires_at?: string;
}> {
  const res = await callFunction<{
    outcome: string;
    server_time?: string;
    last_heartbeat_at?: string;
    heartbeat_expires_at?: string;
  }>("ad-heartbeat", { session_id: sessionId });
  if (!res.ok) return { outcome: "heartbeat_failed" };
  return res.data;
}

/**
 * Termine manuellement la session de l'utilisateur via Edge Function.
 * Motifs normalisés côté serveur (USER_PAUSED_AD par défaut).
 */
export async function endWifiSession(
  sessionId: string,
  reason: string = "USER_PAUSED_AD"
): Promise<boolean> {
  const res = await callFunction<{ success?: boolean }>("end-wifi-session", {
    session_id: sessionId,
    reason,
  });
  return res.ok && res.data.success !== false;
}

/**
 * Récupère la session active (ou la plus récente) de l'utilisateur.
 */
export async function getActiveSession(): Promise<WifiSession | null> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return null;

  const { data, error } = await getSupabase()
    .from("wifi_sessions")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["pending", "authorizing", "authorized", "active", "paused"] as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapSessionRow(data as unknown as Record<string, unknown>);
}

/**
 * Historique des sessions passées.
 */
export async function fetchHistory(): Promise<ConnectionHistoryItem[]> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return [];

  const { data, error } = await getSupabase()
    .from("wifi_sessions")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["disconnected", "expired", "failed"])
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const startedAt = (r.started_at as string) ?? undefined;
    const endedAt = (r.ended_at as string) ?? undefined;
    const durationMinutes =
      startedAt && endedAt
        ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000))
        : 0;
    return {
      id: r.id as string,
      connectedAt: startedAt ?? "",
      disconnectedAt: endedAt,
      durationMinutes,
      dataUsedMB: (r.bytes_total as number) ? Math.round(((r.bytes_total as number) ?? 0) / (1024 * 1024)) : undefined,
      status: r.status === "expired" ? "expired" : r.status === "failed" ? "interrupted" : "completed",
      disconnectReason: (r.disconnect_reason as ConnectionHistoryItem["disconnectReason"]) ?? undefined,
    };
  });
}

/**
 * Consommation réelle d'une session (depuis l'adaptateur réseau).
 * La SOURCE DE VÉRITÉ est désormais le routeur via l'agent local
 * (coté server → quota-status) : cette lecture reste un recours.
 */
export async function fetchSessionUsage(reference: string): Promise<SessionUsage> {
  void reference;
  return { consumedSeconds: 0, consumedBytes: 0, available: false };
}

export function mapSessionRow(row: Record<string, unknown>): WifiSession {
  return {
    id: row.id as string,
    status: (row.status as WifiSession["status"]) ?? "pending",
    startedAt: (row.started_at as string) ?? undefined,
    endedAt: (row.ended_at as string) ?? undefined,
    allocatedBytes: (row.allocated_bytes as number) ?? 0,
    consumedBytes: (row.bytes_total as number) ?? 0,
    authorizationState: (row.authorization_state as string) ?? undefined,
    adState: (row.ad_state as string) ?? undefined,
    routerSessionReference: (row.router_session_reference as string) ?? undefined,
    heartbeatExpiresAt: (row.heartbeat_expires_at as string) ?? undefined,
    disconnectReason: (row.disconnect_reason as string) ?? undefined,
  };
}

/**
 * Demande une session Wi-Fi en mode démonstration autonome Android.
 * Appelle request_demo_wifi_session dans Supabase (aucun routeur physique requis).
 */
export async function requestDemoWifiSession(input: {
  siteId?: string;
  sessionToken?: string;
}): Promise<{
  ok: boolean;
  outcome?: string;
  sessionId?: string;
  status?: string;
  authorizationState?: string;
  routerSessionReference?: string;
  heartbeatExpiresAt?: string;
  reason?: string;
}> {
  let token: string;
  try {
    token = await getApiToken();
  } catch {
    return { ok: false, reason: "unauthorized" };
  }

  const userId = decodeSub(token);
  if (!userId) return { ok: false, reason: "unauthorized" };

  const profile = await fetchProfileOrg(userId, token);
  if (!profile) return { ok: false, reason: "no_organization" };

  const res = await callRpc<Record<string, unknown>>("request_demo_wifi_session", {
    p_user_id: userId,
    p_organization_id: profile.organization_id,
    p_site_id: input.siteId ?? null,
    p_session_token: input.sessionToken ?? "demo-token",
  });

  if (!res.ok || res.data === null) {
    // Motif PRÉCIS propagé (timeout / network_error / code PostgREST) pour que
    // resumeFromPaused distingue une panne transitoire d'une fin de session.
    return { ok: false, reason: !res.ok ? res.error.code : "session_failed" };
  }

  const d = res.data;
  const outcome = (d.outcome as string) ?? "unknown";
  const createOrResume = outcome === "created" || outcome === "resume";
  return {
    ok: createOrResume,
    outcome,
    sessionId: (d.session_id as string) ?? undefined,
    status: (d.status as string) ?? undefined,
    authorizationState: (d.authorization_state as string) ?? undefined,
    routerSessionReference: (d.router_session_reference as string) ?? undefined,
    heartbeatExpiresAt: (d.heartbeat_expires_at as string) ?? undefined,
    reason: createOrResume ? undefined : ((d.reason as string) ?? outcome),
  };
}

function decodeSub(token: string): string | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    let pad = payloadB64;
    while (pad.length % 4 !== 0) pad += "=";
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(pad.replace(/-/g, "+").replace(/_/g, "/")), (c: string) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

async function fetchProfileOrg(
  userId: string,
  token: string
): Promise<{ organization_id: string | null } | null> {
  try {
    const config = getConfig();
    const url = `${config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/profiles?id=eq.${userId}&select=organization_id`;
    // Délai BORNÉ : sans timeout, une requête suspendue gelait indéfiniment
    // la reprise de session (« Autorisation en cours » sans fin, BUG 1 v5).
    const response = await Promise.race([
      fetch(url, {
        headers: {
          apikey: config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
    ]);
    if (!response.ok) return null;
    const rows = (await response.json()) as { organization_id: string | null }[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Consommation simulée de quota pour les tests de démonstration.
 * Idempotente, atomique, bornée au quota restant.
 */
export async function simulateDemoConsumption(
  bytesToConsume: number
): Promise<{
  ok: boolean;
  consumedBytes?: number;
  remainingBytes?: number;
  quotaBytes?: number;
  exhausted?: boolean;
  reason?: string;
}> {
  let token: string;
  try {
    token = await getApiToken();
  } catch {
    return { ok: false, reason: "unauthorized" };
  }

  const userId = decodeSub(token);
  if (!userId) return { ok: false, reason: "unauthorized" };

  const idempotencyKey = `demo_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const res = await callRpc<Record<string, unknown>>("demo_consume_quota", {
    p_user_id: userId,
    p_bytes: bytesToConsume,
    p_idempotency_key: idempotencyKey,
  });

  if (!res.ok || res.data === null) {
    return { ok: false, reason: "quota_failed" };
  }

  const d = res.data;
  return {
    ok: Boolean(d.ok),
    consumedBytes: Number(d.consumed_bytes ?? 0),
    remainingBytes: Number(d.remaining_bytes ?? 0),
    quotaBytes: Number(d.quota_bytes ?? 0),
    exhausted: Boolean(d.exhausted),
    reason: (d.reason as string) ?? undefined,
  };
}

/**
 * Réinitialisation explicite du quota de démonstration (5 Go).
 */
export async function resetDemoQuota(): Promise<{
  ok: boolean;
  remainingBytes?: number;
  quotaBytes?: number;
  reason?: string;
}> {
  let token: string;
  try {
    token = await getApiToken();
  } catch {
    return { ok: false, reason: "unauthorized" };
  }

  const userId = decodeSub(token);
  if (!userId) return { ok: false, reason: "unauthorized" };

  const res = await callRpc<Record<string, unknown>>("demo_reset_quota", {
    p_user_id: userId,
    p_quota_bytes: DEMO_QUOTA_BYTES, // 5 GiB, octets explicites
  });

  if (!res.ok || res.data === null) {
    return { ok: false, reason: "reset_failed" };
  }

  const d = res.data;
  return {
    ok: Boolean(d.ok),
    remainingBytes: Number(d.remaining_bytes ?? 0),
    quotaBytes: Number(d.quota_bytes ?? 0),
    reason: (d.reason as string) ?? undefined,
  };
}