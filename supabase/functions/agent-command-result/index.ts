// ============================================================
// agent-command-result — L'agent local renvoie l'issue d'une
// commande réseau (success / échec + message + résultat).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { bearerToken, resolveAgentByToken } from "../_shared/agents.ts";

interface ResultBody {
  command_id?: string;
  ok?: boolean;
  error_message?: string;
  result?: unknown;
  /** Renseigné par l'agent après une authorize réussie : référence côté routeur. */
  session_id?: string;
  router_session_reference?: string;
}

export async function agentCommandResult(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: ResultBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.command_id) return fail("command_id requis", 400, "missing_command_id");
  if (typeof body.ok !== "boolean") return fail("ok bool requis", 400, "missing_ok");

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const { data: cmd, error } = await admin
    .from("network_commands")
    .select("id, site_id, organization_id")
    .eq("id", body.command_id)
    .maybeSingle();
  if (error || !cmd) return fail("Commande introuvable", 404, "command_not_found");
  if (cmd.site_id !== agent.site_id || cmd.organization_id !== agent.organization_id) {
    return fail("Commande hors de la juridiction de l'agent", 403, "command_out_of_scope");
  }

  const next = body.ok ? "completed" : "failed";
  const update: Record<string, unknown> = {
    status: next,
    completed_at: new Date().toISOString(),
    attempted_at: new Date().toISOString(),
  };
  if (body.error_message) update.error_message = body.error_message;
  if (body.result !== undefined) update.result = body.result;

  const { error: updErr } = await admin
    .from("network_commands")
    .update(update)
    .eq("id", body.command_id);

  if (updErr) return fail(updErr.message, 500, "update_failed");

  // Après une authorize réussie, persiste la référence routeur sur la session
  // (nécessaire au reaping de la réconciliation et à la lecture admin).
  if (body.ok && body.session_id && body.router_session_reference) {
    const { data: session } = await admin
      .from("wifi_sessions")
      .select("id, site_id")
      .eq("id", body.session_id)
      .maybeSingle();
    if (session && session.site_id === agent.site_id) {
      await admin
        .from("wifi_sessions")
        .update({ router_session_reference: body.router_session_reference })
        .eq("id", body.session_id);
    }
  }

  return ok({ updated: true, command_id: body.command_id, status: next });
}

Deno.serve(agentCommandResult);