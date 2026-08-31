import { getSupabase } from "../lib/supabase";
import { callFunction } from "../lib/functions";
import { logger } from "../lib/logger";
import type { WifiSession, SessionUsage, ConnectionHistoryItem } from "../types";

const TAG = "sessions";

/**
 * Récupère le quota disponible de l'utilisateur courant, tel que
 * calculé côté serveur (somme des transactions).
 */
export async function fetchUsage(): Promise<{
  remainingSeconds: number;
  remainingBytes: number;
  available: boolean;
}> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return { remainingSeconds: 0, remainingBytes: 0, available: false };

  const { data, error } = await getSupabase()
    .rpc("get_user_quota", { p_user_id: user.id });

  if (error || data === null) {
    logger.warn(TAG, "get_user_quota impossible", error?.message);
    return { remainingSeconds: 0, remainingBytes: 0, available: false };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    remaining_seconds?: number;
    remaining_bytes?: number;
  };
  return {
    remainingSeconds: row?.remaining_seconds ?? 0,
    remainingBytes: row?.remaining_bytes ?? 0,
    available: true,
  };
}

/**
 * Demande la création d'une session Wi-Fi via la Edge Function
 * 'request-wifi-session' (seule manière de créer une session authorized).
 */
export async function requestWifiSession(input: {
  siteId?: string;
  routerId?: string;
  adViewId: string;
}): Promise<{ ok: boolean; sessionId?: string; reason?: string }> {
  const res = await callFunction<{ session_id?: string; reason?: string }>("request-wifi-session", {
    site_id: input.siteId,
    router_id: input.routerId,
    ad_view_id: input.adViewId,
  });

  if (!res.ok) {
    return { ok: false, reason: res.error.code };
  }
  if (res.data.session_id) {
    return { ok: true, sessionId: res.data.session_id };
  }
  return { ok: false, reason: res.data.reason ?? "unknown" };
}

/**
 * Récupère la session active (ou plus récente) de l'utilisateur.
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
    .in("status", ["pending", "authorized", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapSessionRow(data);
}

/**
 * Termine manuellement la session de l'utilisateur via Edge Function.
 */
export async function endWifiSession(sessionId: string): Promise<boolean> {
  const res = await callFunction<{ success?: boolean }>("end-wifi-session", {
    session_id: sessionId,
    reason: "user_disconnected",
  });
  return res.ok && res.data.success !== false;
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

  return data.map((row) => ({
    id: row.id,
    connectedAt: row.started_at,
    disconnectedAt: row.ended_at ?? undefined,
    durationMinutes: row.allocated_seconds ? Math.round(row.allocated_seconds / 60) : 0,
    dataUsedMB: row.consumed_bytes ? Math.round(row.consumed_bytes / (1024 * 1024)) : undefined,
    status: row.status === "expired" ? "expired" : row.status === "failed" ? "interrupted" : "completed",
    disconnectReason: (row.disconnect_reason as ConnectionHistoryItem["disconnectReason"]) ?? undefined,
  }));
}

/**
 * Récupère la consommation réelle de la session (si l'adaptateur réseau
 * la fournit). Sinon renvoie "indisponible".
 */
export async function fetchSessionUsage(reference: string): Promise<SessionUsage> {
  // Intégration réelle : interroger l'adaptateur réseau via une Edge
  // function dédiée. Tant que le réseau n'est pas branché, on renvoie
  // "indisponible" explicitement.
  void reference;
  return { consumedSeconds: 0, consumedBytes: 0, available: false };
}

function mapSessionRow(row: Record<string, unknown>): WifiSession {
  return {
    id: row.id as string,
    status: (row.status as WifiSession["status"]) ?? "pending",
    startedAt: (row.started_at as string) ?? new Date().toISOString(),
    expiresAt: (row.expires_at as string) ?? undefined,
    endedAt: (row.ended_at as string) ?? undefined,
    allocatedSeconds: (row.allocated_seconds as number) ?? 0,
    allocatedBytes: (row.allocated_bytes as number) ?? 0,
    consumedSeconds: row.consumed_seconds as number | undefined,
    consumedBytes: row.consumed_bytes as number | undefined,
    networkSessionReference: (row.network_session_reference as string) ?? undefined,
    disconnectReason: (row.disconnect_reason as string) ?? undefined,
  };
}
