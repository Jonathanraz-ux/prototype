import { getSupabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import type { AppNotification } from "../types";

const TAG = "notifications";

/**
 * Récupère les notifications internes persistées de l'utilisateur.
 * Fonctionne toujours (indépendant de la configuration push).
 */
export async function fetchNotifications(): Promise<AppNotification[]> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return [];

  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.warn(TAG, "Lecture notifications impossible", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type as AppNotification["type"],
    read: !!row.read_at,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return;

  await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
}

export async function fetchUnreadCount(): Promise<number> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return 0;

  const { count } = await getSupabase()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

/**
 * Enregistre le token de push (si configuré). Retourne l'état de
 * configuration : 'NOT_CONFIGURED' tant que les credentials Expo Push
 * ne sont pas fournies.
 */
export async function registerPushToken(token: string): Promise<"NOT_CONFIGURED" | "registered"> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return "registered";

  // Si aucun projectId Expo n'est configuré, on n'enregistre pas.
  const { error } = await getSupabase()
    .from("push_tokens")
    .upsert(
      { user_id: user.id, expo_push_token: token, active: true },
      { onConflict: "expo_push_token" }
    );

  if (error) {
    logger.warn(TAG, "Enregistrement push token impossible", error.message);
    return "NOT_CONFIGURED";
  }
  return "registered";
}
