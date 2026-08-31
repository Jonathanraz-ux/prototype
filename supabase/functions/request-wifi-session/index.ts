// ============================================================
// request-wifi-session — Demande la création d'une session Wi-Fi.
// Délègue à la fonction PostgreSQL atomique request_wifi_session
// (service_role). Retourne l'identifiant de session si acceptée.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

interface RequestSessionBody {
  site_id?: string;
  router_id?: string;
  ad_view_id?: string;
}

export async function requestWifiSession(req: Request): Promise<Response> {
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

  let body: RequestSessionBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.ad_view_id) return fail("ad_view_id requis", 400, "missing_ad_view");

  // Organisation + appareil de l'utilisateur.
  const { data: profile } = await pub
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return ok({ session_id: undefined, reason: "no_organization" });
  }

  const { data: device } = await pub
    .from("devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = serviceClient();
  const { data, error } = await admin.rpc("request_wifi_session", {
    p_user_id: user.id,
    p_organization_id: profile.organization_id,
    p_site_id: body.site_id ?? null,
    p_router_id: body.router_id ?? null,
    p_device_id: device?.id ?? null,
    p_ad_view_id: body.ad_view_id,
  });

  if (error) {
    return ok({ session_id: undefined, reason: "server_error" });
  }

  const result = data as string;
  // La fonction retourne soit l'identifiant de session (uuid) soit une raison.
  if (result === "session_already_active" || result === "no_reward") {
    return ok({ session_id: undefined, reason: result });
  }
  return ok({ session_id: result, reason: "ok" });
}
