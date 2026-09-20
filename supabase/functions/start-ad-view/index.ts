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
  const supabase = publicClient(token);
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

  // Organisation de l'utilisateur. Un compte auto-inscrit (aucun
  // organization_id) est rattaché automatiquement à l'organisation de
  // démonstration : sans rattachement, le flux publicitaire → session
  // était coupé à la racine (no_organization).
  let profile = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  let orgId = profile?.organization_id ?? null;
  if (!orgId) {
    const { data: onboard } = await supabase.rpc("bujo_onboard_org", {
      p_user_id: user.id,
    });
    orgId = (onboard as { organization_id?: string } | null)?.organization_id ?? null;
    if (orgId) profile = { organization_id: orgId };
  }
  if (!orgId) {
    return fail("Profil incomplet", 400, "no_organization");
  }

  const nowIso = new Date().toISOString();

  // Résolution de la campagne : si l'identifiant demandé existe pour
  // l'organisation, il est utilisé. Sinon (identifiant de repli inconnu,
  // ex. « demo-campaign-video » du mode démo, ou campagne d'une autre
  // organisation), on retombe sur une campagne active de l'organisation
  // — de préférence la campagne de repli dédiée (is_fallback). Le flux ne
  // doit jamais se bloquer sur un identifiant publicitaire inconnu.
  let campaign: Record<string, unknown> | null = null;
  if (body.campaign_id) {
    const { data: found, error: foundErr } = await supabase
      .from("ad_campaigns")
      .select("id, organization_id, site_id, title, advertiser_name, media_url, thumbnail_url, duration_seconds, reward_type, reward_value, starts_at, ends_at, is_fallback")
      .eq("id", body.campaign_id)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (!foundErr && found) campaign = found;
  }

  if (!campaign) {
    const { data: fallback, error: fbErr } = await supabase
      .from("ad_campaigns")
      .select("id, organization_id, site_id, title, advertiser_name, media_url, thumbnail_url, duration_seconds, reward_type, reward_value, starts_at, ends_at, is_fallback")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .order("is_fallback", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fbErr || !fallback) {
      return fail("Aucune campagne publicitaire active", 404, "campaign_unavailable");
    }
    campaign = fallback;
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
      organization_id: orgId,
      campaign_id: campaign.id,
      site_id: (campaign.site_id as string | null) ?? null,
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
    // Campagne de repli : identifiant symbolique du mode démo → le client
    // lit la vidéo LOCALE embarquée (chargement instantané, sans réseau),
    // au lieu de streamer media_url (lent sur liaison mobile faible).
    id: row.is_fallback ? "demo-campaign-video" : row.id,
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

Deno.serve(startAdView);
