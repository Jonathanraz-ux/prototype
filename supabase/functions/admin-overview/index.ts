// ============================================================
// admin-overview — Vue agrégée d'administration pour un admin
// d'organisation (allocations, sessions, événements, commandes,
// agents, routeurs). Délegue à public.admin_overview_json.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

export async function adminOverview(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

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
    .select("organization_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return fail("Aucune organisation", 403, "no_organization");
  }
  const isAdmin =
    profile.role === "organization_admin" || profile.role === "super_admin";
  if (!isAdmin) {
    return fail("Rôle insuffisant", 403, "forbidden");
  }

  const admin = serviceClient();
  const { data, error } = await admin.rpc("admin_overview_json", {
    p_org_id: profile.organization_id,
  });
  if (error) return fail(error.message, 500, "overview_failed");

  return ok(data);
}

Deno.serve(adminOverview);