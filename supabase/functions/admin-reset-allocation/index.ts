// ============================================================
// admin-reset-allocation — Réinitialisation MANUELLE d'une
// allocation (remise à zéro du quota consommé), réservée à un
// admin d'organisation. Tracée via public.admin_reset_allocation
// dans audit_logs + network_events. N'arrive JAMAIS automatiquement
// à la reconnexion.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

interface ResetBody {
  allocation_id?: string;
}

export async function adminResetAllocation(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: ResetBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.allocation_id) return fail("allocation_id requis", 400, "missing_allocation");

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
  const isAdmin =
    profile?.role === "organization_admin" || profile?.role === "super_admin";
  if (!profile?.organization_id || !isAdmin) {
    return fail("Rôle insuffisant", 403, "forbidden");
  }

  // L'allocation doit appartenir à l'organisation de l'admin.
  const allocation = await adminCheckAllocation(pub, body.allocation_id!, profile.organization_id);
  if (!allocation) {
    return fail("Allocation introuvable", 404, "allocation_not_found");
  }

  const admin = serviceClient();
  const { data, error } = await admin.rpc("admin_reset_allocation", {
    p_allocation_id: body.allocation_id,
    p_actor_id: user.id,
  });
  if (error) return fail(error.message, 500, "reset_failed");

  return ok(data);
}

async function adminCheckAllocation(
  pub: ReturnType<typeof publicClient>,
  allocationId: string,
  orgId: string
): Promise<{ id: string } | null> {
  const { data, error } = await pub
    .from("allocations")
    .select("id, site_id")
    .eq("id", allocationId)
    .maybeSingle();
  if (error || !data) return null;

  const { data: site } = await pub
    .from("sites")
    .select("id")
    .eq("id", data.site_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return site ? { id: data.id } : null;
}

Deno.serve(adminResetAllocation);