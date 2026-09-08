// ============================================================
// agent-reconcile — Reconcilie l'état du serveur avec l'état réel
// du routeur. L'agent fournit la liste des clients qu'il observe
// (MAC / IP / références); le serveur re-embarque celles qu'il
// considère actives mais que le routeur ne connaît plus, et coupe
// la session correspondante (NETWORK_LOST).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { bearerToken, resolveAgentByToken } from "../_shared/agents.ts";

interface RouterClient {
  session_id?: string;
  mac?: string;
  ip?: string;
  reference?: string;
}

interface ReconcileBody {
  router_clients?: RouterClient[];
}

export async function agentReconcile(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: ReconcileBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const { data: sessions, error: sessErr } = await admin
    .from("wifi_sessions")
    .select("id, session_token, device_observed_mac, device_observed_ip, router_session_reference, status")
    .eq("site_id", agent.site_id)
    .in("status", ["authorized", "active", "paused"]);

  if (sessErr) return fail(sessErr.message, 500, "load_failed");
  const dbActive = (sessions ?? []) as Array<{
    id: string;
    session_token: string | null;
    device_observed_mac: string | null;
    device_observed_ip: string | null;
    router_session_reference: string | null;
    status: string;
  }>;

  const routerRefs = new Set(
    (body.router_clients ?? [])
      .map((c) => c.session_id || c.mac || c.ip || c.reference)
      .filter((v): v is string => Boolean(v))
      .map((v) => v.toLowerCase())
  );

  const toReap: string[] = [];
  for (const s of dbActive) {
    const key = s.router_session_reference?.toLowerCase() ||
      s.session_token?.toLowerCase() ||
      s.device_observed_mac?.toLowerCase() ||
      s.device_observed_ip?.toLowerCase();
    if (key && !routerRefs.has(key)) {
      toReap.push(s.id);
    }
  }

  // Coupe les sessions fantômes (idempotent côté serveur).
  let reaped = 0;
  for (const sessionId of toReap) {
    const { error } = await admin.rpc("end_network_session", {
      p_session_id: sessionId,
      p_reason: "NETWORK_LOST",
    });
    if (!error) reaped++;
  }

  return ok({
    db_active: dbActive.length,
    to_reap: toReap.length,
    reaped,
    site_id: agent.site_id,
  });
}

Deno.serve(agentReconcile);