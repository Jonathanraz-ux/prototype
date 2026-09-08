// ============================================================
// end-wifi-session — Termine une session Wi-Fi de l'utilisateur.
// Vérifie l'appartenance de la session puis délègue à la fonction
// PostgreSQL atomique end_network_session (service_role).
// Motifs normalisés : USER_PAUSED_AD / APP_BACKGROUND / USER_LOGOUT
// / NETWORK_LOST / QUOTA_EXHAUSTED / ...
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";
import { normalizeReason } from "../_shared/session-machine.ts";
import { sendPush } from "../_shared/push.ts";

interface EndSessionBody {
  session_id?: string;
  reason?: string;
}

export async function endWifiSession(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  let body: EndSessionBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.session_id) return fail("session_id requis", 400, "missing_session");

  const pub = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  // L'utilisateur ne peut terminer que sa propre session.
  const { data: session } = await pub
    .from("wifi_sessions")
    .select("id")
    .eq("id", body.session_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) {
    return ok({ success: false });
  }

  const reason = normalizeReason(body.reason ?? "USER_PAUSED_AD");
  const admin = serviceClient();
  const { data, error } = await admin.rpc("end_network_session", {
    p_session_id: body.session_id,
    p_reason: reason,
  });

  if (error) {
    return ok({ success: false });
  }

  if (data === true && reason === "QUOTA_EXHAUSTED") {
    await sendPush({
      user_id: user.id,
      title: "Session Wi-Fi terminée",
      body: "Votre quota de données est épuisé. La session Wi-Fi a été interrompue.",
      type: "quota",
      data: { session_id: body.session_id },
    });
  }

  return ok({ success: data === true });
}

Deno.serve(endWifiSession);