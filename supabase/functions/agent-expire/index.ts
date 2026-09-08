// ============================================================
// agent-expire — L'agent local déclenche l'expiration serveur des
// sessions sans heartbeat (complément à la tâche cron). Délegue à
// public.expire_stale_network_sessions.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { bearerToken, resolveAgentByToken, intFromEnv } from "../_shared/agents.ts";

export async function agentExpire(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const grace = intFromEnv("WIFI_HEARTBEAT_GRACE_SECONDS", 25);
  const { data, error } = await admin.rpc("expire_stale_network_sessions", {
    p_grace_seconds: grace,
  });

  if (error) return fail(error.message, 500, "expire_failed");

  return ok({ expired: data ?? 0, site_id: agent.site_id });
}

Deno.serve(agentExpire);