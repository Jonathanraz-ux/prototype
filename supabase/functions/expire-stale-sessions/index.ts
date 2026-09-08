// ============================================================
// expire-stale-sessions — Expiration serveur des sessions dont le
// heartbeat a gréssé (crash, force-stop, téléphone éteint, fermeture
// non coopérative). Délegue à public.expire_stale_network_sessions.
//
// Sécurité : seuls les appels authentifiés par Service Role ou par
// WIFI_CRON_SECRET sont acceptés. Sans variable configurée, la
// fonction refuse (on ne veut JAMAIS d'expiration déclenchable par
// un tiers en production).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { intFromEnv } from "../_shared/agents.ts";

export async function expireStaleSessions(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cron = req.headers.get("x-cron-secret") ?? "";

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("WIFI_CRON_SECRET") ?? "";

  // Accepté si Bearer == service_role (appel effectué par l'authent
  // Supabase) OU si un secret cron explicite est fourni ET configuré.
  const viaServiceRole = serviceKey.length > 0 && bearer.length > 0 && bearer === serviceKey;
  const viaCron = cronSecret.length > 0 && cron.length > 0 && cron === cronSecret;

  if (!viaServiceRole && !viaCron) {
    return fail("Non autorisé", 403, "unauthorized_cron");
  }

  const grace = intFromEnv("WIFI_HEARTBEAT_GRACE_SECONDS", 25);
  const admin = serviceClient();
  const { data, error } = await admin.rpc("expire_stale_network_sessions", {
    p_grace_seconds: grace,
  });

  if (error) {
    return fail(error.message, 500, "expire_failed");
  }

  return ok({ expired: data ?? 0 });
}

Deno.serve(expireStaleSessions);