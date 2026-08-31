// ============================================================
// start-ad-view — Démarre la lecture d'une publicité.
// Génère un nonce signé et enregistre la vue (statut abaissé à
// 'abandoned' ; la valorisation réelle est faite côté serveur dans
// complete-ad-view).
// ============================================================

import { handleCors, ok, fail, methodNotAllowed } from "../_shared/http.ts";
import { publicClient } from "../_shared/supabase.ts";

interface StartViewBody {
  campaign_id?: string;
}

export async function startAdView(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentification requise", 401, "unauthorized");

  // Récupère l'utilisateur authentifié (clé publishable, vérification JWT).
  const supabase = publicClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return fail("Jeton invalide ou expiré", 401, "unauthorized");
  }

  let body: StartViewBody;
  try {
    body = await req.json();
  } catch {
    return fail("Corps de requête invalide");
  }

  if (!body.campaign_id) {
    return fail("campaign_id requis", 400, "missing_campaign");
  }

  // Vérifie que la campagne est active, dans sa fenêtre de diffusion,
  // et rattachée à l'organisation de l'utilisateur.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return fail("Profil incomplet", 400, "no_organization");
  }

  const { data: campaign, error: campErr } = await supabase
    .from("ad_campaigns")
    .select("id, organization_id, title, advertiser_name, media_url, thumbnail_url, duration_seconds, reward_type, reward_value, starts_at, ends_at")
    .eq("id", body.campaign_id)
    .eq("status", "active")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (campErr || !campaign) {
    return fail("Campagne indisponible", 404, "campaign_unavailable");
  }

  const now = Date.now();
  if (
    (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) ||
    (campaign.ends_at && new Date(campaign.ends_at).getTime() < now)
  ) {
    return fail("Campagne hors fenêtre de diffusion", 400, "campaign_unavailable");
  }

  // Nonce signé : permet au serveur de vérifier l'authenticité plus tard.
  const timestamp = Math.floor(now / 1000);
  const proofToken = await signProof(`${body.campaign_id}:${user.id}:${timestamp}`);

  const { data: view, error: viewErr } = await supabase
    .from("ad_views")
    .insert({
      organization_id: profile.organization_id,
      campaign_id: body.campaign_id,
      user_id: user.id,
      proof_nonce: proofToken,
      completion_status: "abandoned",
      watched_seconds: 0,
      reward_granted: false,
    })
    .select("id, proof_nonce")
    .single();

  if (viewErr || !view) {
    return fail("Impossible d'enregistrer la vue", 500, "insert_failed");
  }

  const expiresAt = new Date(now + (campaign.duration_seconds + 30) * 1000).toISOString();

  return ok({
    viewId: view.id,
    proof_nonce: view.proof_nonce,
    campaign: mapCampaign(campaign),
    expiresAt,
  });
}

async function signProof(payload: string): Promise<string> {
  const secret = Deno.env.get("ADVERTISEMENT_PROOF_SECRET") ?? "";
  if (!secret) return `unsecured:${btoa(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${btoa(payload)}.${hex}`;
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
