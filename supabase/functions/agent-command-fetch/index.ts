// ============================================================
// agent-command-fetch — L'agent local tire les commandes réseau
// en attente pour SON site. Chaque commande est SIGNÉE avec
// NETWORK_HMAC_SECRET (enveloppe "id|type|site_id|expires_at|
// payload") avant remise ; l'agent vérifie la signature avant
// incidence sur le routeur.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import {
  bearerToken,
  resolveAgentByToken,
  hmacSecret,
} from "../_shared/agents.ts";
import { signCommand } from "../_shared/network-commands.ts";

interface FetchBody {
  limit?: number;
}

export async function agentCommandFetch(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const secret = hmacSecret();
  if (!secret) return fail("NETWORK_HMAC_SECRET non configuré", 503, "hmac_missing");

  let body: FetchBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = bearerToken(req);
  const admin = serviceClient();
  const agent = await resolveAgentByToken(admin, token);
  if (!agent) return fail("Agent non reconnu", 401, "agent_unknown");

  const limit = Math.min(Math.max(1, body.limit ?? 10), 50);

  const { data, error } = await admin
    .from("network_commands")
    .select("id, type, site_id, payload, expires_at, created_at")
    .eq("site_id", agent.site_id)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return fail(error.message, 500, "fetch_failed");
  const rows = (data ?? []) as Array<{
    id: string;
    type: string;
    site_id: string;
    payload: string;
    expires_at: string | null;
  }>;

  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await admin
      .from("network_commands")
      .update({ status: "claimed", attempted_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "pending");
  }

  const commands = await Promise.all(
    rows.map(async (r) => {
      const signature = await signCommand(secret, {
        id: r.id,
        type: r.type,
        site_id: r.site_id,
        expires_at: r.expires_at,
        payload: r.payload,
      });
      // The expires_at string coming from the DB is forwarded UNCHANGED,
      // so the signature stays verifiable by the agent.
      return {
        id: r.id,
        type: r.type,
        site_id: r.site_id,
        payload: r.payload,
        expires_at: r.expires_at,
        signature,
      };
    })
  );

  return ok({ commands, site_id: agent.site_id });
}

Deno.serve(agentCommandFetch);