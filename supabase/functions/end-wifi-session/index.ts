// ============================================================
// end-wifi-session — Termine une session Wi-Fi de l'utilisateur.
// Vérifie l'appartenance de la session puis délègue à la fonction
// PostgreSQL atomique end_wifi_session (service_role).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";
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

  const pub = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  let body: EndSessionBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.session_id) return fail("session_id requis", 400, "missing_session");

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

  const admin = serviceClient();
  const { data, error } = await admin.rpc("end_wifi_session", {
    p_session_id: body.session_id,
    p_reason: body.reason ?? "user_disconnected",
  });

  if (error) {
    return ok({ success: false });
  }

  // Avertir l'utilisateur de la fin de sa session (notification interne + push).
  if (data === true) {
    const reason = body.reason ?? "user_disconnected";
    const message =
      reason === "quota_exceeded"
        ? "Votre quota de données est épuisé. La session Wi-Fi a été interrompue."
        : "Votre session Wi-Fi s'est terminée.";
    await sendPush({
      user_id: user.id,
      title: "Session Wi-Fi terminée",
      body: message,
      type: "quota",
      data: { session_id: body.session_id },
    });
  }

  return ok({ success: data === true });
}
