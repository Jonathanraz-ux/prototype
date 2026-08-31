// ============================================================
// send-push — Enregistre une notification interne et envoie le
// push associé via l'API Expo Push.
// ------------------------------------------------------------
// Réservé au serveur (service_role / appels internes). N'est pas
// destiné à être appelé directement par le client.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { sendPush as sendPushHelper } from "../_shared/push.ts";

interface SendPushBody {
  user_id: string;
  title: string;
  body: string;
  type?: "promotion" | "maintenance" | "quota" | "system";
  data?: Record<string, string>;
}

export async function sendPush(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: SendPushBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.user_id || !body.title || !body.body) {
    return fail("user_id, title et body requis", 400, "missing_fields");
  }

  const result = await sendPushHelper({
    user_id: body.user_id,
    title: body.title,
    body: body.body,
    type: body.type,
    data: body.data,
  });

  return ok({
    notification_id: result.notification_id,
    sent: result.sent,
    skipped: result.skipped,
  });
}
