import { getSupabase } from "../lib/supabase";
import { callFunction } from "../lib/functions";
import { logger } from "../lib/logger";
import type {
  AdCampaign,
  AvailableCampaignResult,
  StartAdViewResult,
  CompleteAdViewResult,
} from "../types";

const TAG = "ads";

export const DEMO_AD_CAMPAIGN: AdCampaign = {
  id: "demo-campaign-video",
  title: "[DÉMO] Publicité de test Bôjô",
  advertiserName: "Partenaire Démo",
  mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  durationSeconds: 15,
  rewardType: "minutes",
  rewardValue: 30,
  type: "video",
  background: "#0B1220",
  accentColor: "#5913f5",
  cta: "Accéder à Internet",
};

/**
 * Récupère une campagne disponible pour l'utilisateur courant
 * via la Edge Function 'get-available-campaign'.
 * Si l'utilisateur est un compte démo ou si le backend signale une erreur/inventaire vide,
 * fournit la publicité de test démo explicitement identifiée.
 */
export async function getAvailableCampaign(): Promise<AvailableCampaignResult> {
  let backendError: string | null = null;
  try {
    const res = await callFunction<AvailableCampaignResult>("get-available-campaign", {});
    if (res.ok && res.data.campaign) {
      return res.data;
    }
    if (!res.ok) {
      backendError = `Erreur backend (${res.error.code}) : ${res.error.message}`;
      logger.warn(TAG, "get-available-campaign a échoué", res.error.code);
    } else if (res.data.reason !== "available") {
      backendError = `Inventaire vide : aucune campagne active sur le serveur (${res.data.reason})`;
    }
  } catch (e: any) {
    backendError = `Erreur réseau : ${e?.message ?? "impossible de joindre le serveur"}`;
    logger.warn(TAG, "get-available-campaign impossible", e);
  }

// En mode démo, le téléphone doit être autonome : si le backend plante
  // ou ne retourne aucune campagne, on fournit la pub de test locale.
  // En mode prod, on propage l'erreur pour que l'UI affiche le diagnostic.
  const isDemo = (process.env.EXPO_PUBLIC_NETWORK_MODE ?? "") === "android_vpn_demo";
  if (isDemo) {
    logger.info(TAG, "mode démo : fallback sur campagne locale démo", backendError);
    return {
      reason: "available",
      campaign: DEMO_AD_CAMPAIGN,
      errorMessage: backendError ?? undefined,
    };
  }

  return {
    reason: "backend_error",
    errorMessage: backendError ?? "Aucune publicité disponible sur le serveur",
  };
}

/**
 * Démarre la lecture d'une publicité et obtient un nonce signé côté serveur.
 */
export async function startAdView(campaignId: string): Promise<StartAdViewResult | null> {
  try {
    const res = await callFunction<StartAdViewResult>("start-ad-view", { campaign_id: campaignId });
    if (!res.ok) {
      logger.warn(TAG, "start-ad-view a échoué", res.error.code);
      return null;
    }
    return res.data;
  } catch (e) {
    logger.warn(TAG, "start-ad-view impossible", e);
    return null;
  }
}

/**
 * Termine la lecture d'une publicité. La récompense est accordée UNIQUEMENT
 * par la Edge Function (jamais par le téléphone), sauf pour la campagne de test locale.
 */
export async function completeAdView(
  viewId: string,
  watchedSeconds: number
): Promise<CompleteAdViewResult> {
  try {
    const res = await callFunction<CompleteAdViewResult>("complete-ad-view", {
      view_id: viewId,
      watched_seconds: watchedSeconds,
    });
    if (!res.ok) {
      return { success: false, rewardGranted: false, viewId, reason: "invalid" };
    }
    return res.data;
  } catch (e) {
    logger.warn(TAG, "complete-ad-view impossible", e);
    return { success: false, rewardGranted: false, viewId, reason: "invalid" };
  }
}

/**
 * Récupère les campagnes actives visibles (pour la liste commerciale).
 */
export async function fetchActiveCampaigns(): Promise<AdCampaign[]> {
  const { data, error } = await getSupabase()
    .from("ad_campaigns")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn(TAG, "Lecture campagnes impossible", error.message);
    return [];
  }

  return (data ?? []).map(mapCampaignRow);
}

function mapCampaignRow(row: Record<string, unknown>): AdCampaign {
  return {
    id: row.id as string,
    title: (row.title as string) ?? "",
    advertiserName: (row.advertiser_name as string) ?? "",
    mediaUrl: (row.media_url as string) ?? "",
    thumbnailUrl: (row.thumbnail_url as string) ?? undefined,
    durationSeconds: (row.duration_seconds as number) ?? 15,
    rewardType: (row.reward_type as AdCampaign["rewardType"]) ?? "minutes",
    rewardValue: (row.reward_value as number) ?? 30,
    type: ((row.media_url as string) ?? "").match(/\.(mp4|mov|m4v)(\?|$)/i) ? "video" : "image",
    background: "#0B1220",
    accentColor: "#F97316",
    cta: "Découvrir l'offre",
  };
}
