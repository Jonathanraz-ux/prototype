// ============================================================
// agent-ping — Heartbeat l'agent local et l'état du routeur.
// Délegue à public.record_agent_heartbeat (l'agent est marqué
// online/offline, le routeur actif/offline).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { bearerToken, resolveAgentByToken } from "../_shared/agents.ts";

interface PingBody {
  router_ok?: boolean;
}

export async function agentPing(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: PingBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const { data, error } = await admin.rpc("record_agent_heartbeat", {
    p_agent_id: agent.id,
    p_status: "online",
    p_router_ok: body.router_ok ?? null,
  });

  if (error) return fail(error.message, 500, "heartbeat_failed");

  return ok(data ?? { agent_id: agent.id, site_id: agent.site_id });
}

Deno.serve(agentPing);