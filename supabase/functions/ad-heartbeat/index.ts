// ============================================================
// ad-heartbeat — Battement publicitaire sécurisé de l'application.
// Le serveur décide seul de l'état de la session (ok / no_session /
// not_active / quota_exhausted) via public.ad_heartbeat_tick.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";
import { intFromEnv } from "../_shared/agents.ts";

interface HeartbeatBody {
  session_id?: string;
}

export async function adHeartbeat(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  let body: HeartbeatBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.session_id) return fail("session_id requis", 400, "missing_session");

  const pub = publicClient(token);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  // Le battement ne concerne que sa propre session.
  const { data: session } = await pub
    .from("wifi_sessions")
    .select("id")
    .eq("id", body.session_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) {
    return ok({ outcome: "no_session" });
  }

  const grace = intFromEnv("WIFI_HEARTBEAT_GRACE_SECONDS", 25);
  const admin = serviceClient();
  const { data, error } = await admin.rpc("ad_heartbeat_tick", {
    p_session_id: body.session_id,
    p_grace_seconds: grace,
  });

  if (error) {
    return fail(error.message, 500, "heartbeat_failed");
  }

  return ok(data);
}

Deno.serve(adHeartbeat);