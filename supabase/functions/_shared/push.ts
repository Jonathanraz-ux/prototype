// ============================================================
// _shared/push.ts — Envoi de notifications push (Expo Push).
// Utilisé côté serveur (service_role) dans les Edge Functions.
// ============================================================

import { serviceClient } from "./supabase.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  type?: "promotion" | "maintenance" | "quota" | "system";
  data?: Record<string, string>;
}

/**
 * Persiste une notification interne puis envoie le push à tous les
 * tokens actifs de l'utilisateur. Ne lève jamais : les échecs push ne
 * doivent pas bloquer le flux métier. Retourne le nombre d'envois.
 */
export async function sendPush(
  payload: PushPayload,
): Promise<{ notification_id: string | null; sent: number; skipped: boolean }> {
  const admin = serviceClient();
  const type = payload.type ?? "system";

  const { data: notif } = await admin
    .from("notifications")
    .insert({
      user_id: payload.user_id,
      title: payload.title,
      body: payload.body,
      type,
    })
    .select("id")
    .single();

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", payload.user_id)
    .eq("active", true);

  const pushTokens = (tokens ?? [])
    .map((t) => t.expo_push_token)
    .filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken"));

  if (pushTokens.length === 0) {
    return { notification_id: notif?.id ?? null, sent: 0, skipped: true };
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pushTokens,
        title: payload.title,
        body: payload.body,
        sound: "default",
        data: { ...(payload.data ?? {}), notification_id: notif?.id, type },
      }),
    });
    const json = (await res.json()) as { data?: Array<{ status: string }> };
    const sent = json.data?.filter((r) => r.status === "ok").length ?? 0;
    return { notification_id: notif?.id ?? null, sent, skipped: false };
  } catch {
    return { notification_id: notif?.id ?? null, sent: 0, skipped: true };
  }
}
