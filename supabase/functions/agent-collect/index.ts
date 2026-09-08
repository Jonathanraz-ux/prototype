// ============================================================
// agent-collect — Comptabilité réelle du trafic. L'agent local
// remonte les compteurs du routeur pour une session ; le serveur
// calcule le delta depuis la dernière collecte et le borde au
// quota (SOURCE DE VÉRITÉ = routeur, jamais l'application).
// Délegue à public.apply_data_usage.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { bearerToken, resolveAgentByToken } from "../_shared/agents.ts";

interface CollectBody {
  session_id?: string;
  bytes_in?: number;
  bytes_out?: number;
}

export async function agentCollect(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: CollectBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.session_id) return fail("session_id requis", 400, "missing_session");
  if (!Number.isInteger(body.bytes_in) || !Number.isInteger(body.bytes_out)) {
    return fail("compteurs entiers requis", 400, "missing_counters");
  }

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const { data: session } = await admin
    .from("wifi_sessions")
    .select("id, site_id")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session) return fail("Session introuvable", 404, "session_not_found");
  if (session.site_id !== agent.site_id) {
    return fail("Session hors de la juridiction de l'agent", 403, "session_out_of_scope");
  }

  const { data, error } = await admin.rpc("apply_data_usage", {
    p_session_id: body.session_id,
    p_bytes_in: body.bytes_in,
    p_bytes_out: body.bytes_out,
  });

  if (error) return fail(error.message, 500, "apply_usage_failed");

  return ok(data);
}

Deno.serve(agentCollect);