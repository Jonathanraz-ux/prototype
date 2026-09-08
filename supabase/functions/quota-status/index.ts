// ============================================================
// quota-status — État quota + session active pour l'utilisateur.
// Délegue à public.get_quota_status (service_role). Source de
// vérité : les allocations persistantes (5 Go), jamais "recalculées"
// côté client.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

interface QuotaStatusBody {
  site_id?: string;
}

export async function quotaStatus(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed();

  let body: QuotaStatusBody = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

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

  const admin = serviceClient();
  const { data, error } = await admin.rpc("get_quota_status", {
    p_user_id: user.id,
    p_site_id: body.site_id ?? null,
  });

  if (error) {
    return fail(error.message, 500, "quota_status_failed");
  }

  return ok(data);
}

Deno.serve(quotaStatus);