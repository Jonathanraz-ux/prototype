// ============================================================
// request-wifi-session — Demande une session Wi-Fi (nouvelle
// architecture « allocations persistantes »). Délègue à la fonction
// PostgreSQL atomique begin_network_session (service_role).
//
// Le téléphone n'a aucun secret : l'autorisation côté routeur est
// enfilée comme commande SIGNÉE consommée par l'agent local.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";
import { TEST_QUOTA_BYTES } from "../_shared/quota.ts";
import { intFromEnv } from "../_shared/agents.ts";

interface RequestSessionBody {
  site_id?: string;
  router_id?: string;
  session_token?: string;
  device_observed_mac?: string;
  device_observed_ip?: string;
}

export async function requestWifiSession(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  let body: RequestSessionBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.site_id) return fail("site_id requis", 400, "missing_site");
  if (!body.session_token) return fail("session_token requis", 400, "missing_session_token");

  const pub = publicClient(token);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  const { data: profile } = await pub
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return ok({ outcome: "no_organization" });
  }

  // Le site doit appartenir à l'organisation de l'utilisateur.
  const { data: site } = await pub
    .from("sites")
    .select("id")
    .eq("id", body.site_id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!site) {
    return fail("Site introuvable", 404, "site_not_found");
  }

  // Routeur : celui fourni (même org) sinon le premier du site.
  let routerId: string | null = null;
  if (body.router_id) {
    const { data: router } = await pub
      .from("routers")
      .select("id")
      .eq("id", body.router_id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (router) routerId = router.id;
  }
  if (!routerId) {
    const { data: router } = await pub
      .from("routers")
      .select("id")
      .eq("site_id", body.site_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    routerId = router?.id ?? null;
  }

  const { data: device } = await pub
    .from("devices")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const grace = intFromEnv("WIFI_HEARTBEAT_GRACE_SECONDS", 25);
  const quota = intFromEnv("WIFI_TEST_QUOTA_BYTES", TEST_QUOTA_BYTES);

  const admin = serviceClient();
  const { data, error } = await admin.rpc("begin_network_session", {
    p_user_id: user.id,
    p_organization_id: profile.organization_id,
    p_site_id: body.site_id,
    p_router_id: routerId,
    p_device_id: device?.id ?? null,
    p_session_token: body.session_token,
    p_device_observed_mac: body.device_observed_mac ?? null,
    p_device_observed_ip: body.device_observed_ip ?? null,
    p_grace_seconds: grace,
    p_quota_bytes: quota,
  });

  if (error) {
    return fail(error.message, 500, "begin_session_failed");
  }

  // begin_network_session renvoie un jsonb complet (outcome/session/allocation).
  return ok(data);
}

Deno.serve(requestWifiSession);