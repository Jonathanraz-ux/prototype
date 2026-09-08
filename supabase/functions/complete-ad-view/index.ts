// ============================================================
// complete-ad-view — Termine la lecture d'une publicité.
// Délègue l'octroi de la récompense à la fonction PostgreSQL
// atomique complete_ad_view (service_role) pour empêcher toute
// fraude côté client.
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient, serviceClient } from "../_shared/supabase.ts";

interface CompleteViewBody {
  view_id?: string;
  watched_seconds?: number;
}

export async function completeAdView(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  // Vérifie l'utilisateur.
  const pub = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  let body: CompleteViewBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }
  if (!body.view_id) return fail("view_id requis", 400, "missing_view");
  const watched = Math.max(0, Math.floor(body.watched_seconds ?? 0));

  // Vérifie que la vue appartient bien à l'utilisateur courant.
  const { data: view } = await pub
    .from("ad_views")
    .select("id")
    .eq("id", body.view_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!view) {
    return ok({ success: false, rewardGranted: false, viewId: body.view_id, reason: "invalid" });
  }

  // Appelle la fonction atomique avec le client service_role (respecte le
  // garde-fou internal_enforce_service_role).
  const admin = serviceClient();
  const { data, error } = await admin.rpc("complete_ad_view", {
    p_view_id: body.view_id,
    p_watched_seconds: watched,
  });

  if (error) {
    return ok({
      success: false,
      rewardGranted: false,
      viewId: body.view_id,
      reason: "invalid",
    });
  }

  const result = data as string;
  const reason = toReason(result);
  return ok({
    success: result === "rewarded",
    rewardGranted: result === "rewarded",
    viewId: body.view_id,
    reason,
  });
}

function toReason(result: string): CompleteAdViewResultReason | undefined {
  switch (result) {
    case "rewarded":
      return "completed";
    case "already_rewarded":
      return "already_completed";
    case "invalid":
      return "invalid";
    case "too_early":
      return "too_early";
    default:
      return "invalid";
  }
}

type CompleteAdViewResultReason =
  | "completed"
  | "already_completed"
  | "invalid"
  | "too_early"
  | "expired";

Deno.serve(completeAdView);
