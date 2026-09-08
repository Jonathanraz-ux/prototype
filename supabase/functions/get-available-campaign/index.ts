// ============================================================
// get-available-campaign — Retourne une campagne publicitaire
// disponible pour l'utilisateur courant (orchestration de l'app).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient } from "../_shared/supabase.ts";

export async function getAvailableCampaign(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  const supabase = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  // Organisation de l'utilisateur + statut.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, status, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return ok({ reason: "suspended" });
  }
  if (profile.status && profile.status !== "active") {
    return ok({ reason: "suspended" });
  }

  // Organisation active ?
  const { data: org } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", profile.organization_id)
    .maybeSingle();
  if (!org || (org.status && org.status !== "active")) {
    return ok({ reason: "suspended" });
  }

  const now = new Date().toISOString();

  // Campagne active la plus récente, dans sa fenêtre de diffusion.
  const { data: campaigns, error: campErr } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("status", "active")
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (campErr) {
    return ok({ reason: "no_campaign" });
  }

  if (!campaigns || campaigns.length === 0) {
    return ok({ reason: "no_campaign" });
  }

  // Limite quotidienne : ne propose une campagne que si l'utilisateur n'a
  // pas déjà atteint la limite de vues du jour.
  for (const campaign of campaigns) {
    if (campaign.daily_view_limit && campaign.daily_view_limit > 0) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("ad_views")
        .select("id", { count: "exact" })
        .eq("campaign_id", campaign.id)
        .eq("user_id", user.id)
        .gte("started_at", dayStart.toISOString());
      if ((count ?? 0) >= campaign.daily_view_limit) {
        continue;
      }
    }
    return ok({
      reason: "available",
      campaign: mapCampaign(campaign),
    });
  }

  return ok({ reason: "daily_limit", nextAvailableAt: nextMidnight() });
}

function nextMidnight(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

function mapCampaign(row: Record<string, unknown>) {
  const media = (row.media_url as string) ?? "";
  return {
    id: row.id,
    title: row.title ?? "",
    advertiserName: row.advertiser_name ?? "",
    mediaUrl: media,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    durationSeconds: row.duration_seconds ?? 15,
    rewardType: row.reward_type ?? "minutes",
    rewardValue: row.reward_value ?? 30,
    background: "#0B1220",
    accentColor: "#F97316",
    cta: "Découvrir l'offre",
    type: /\.(mp4|mov|m4v)(\?|$)/i.test(media) ? "video" : "image",
  };
}

Deno.serve(getAvailableCampaign);
