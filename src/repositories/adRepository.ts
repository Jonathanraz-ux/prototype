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

/**
 * Récupère une campagne disponible pour l'utilisateur courant
 * via la Edge Function 'get-available-campaign'.
 */
export async function getAvailableCampaign(): Promise<AvailableCampaignResult> {
  try {
    const res = await callFunction<AvailableCampaignResult>("get-available-campaign", {});
    if (!res.ok) {
      logger.warn(TAG, "get-available-campaign a échoué", res.error.code);
      return { reason: "suspended" };
    }
    return res.data;
  } catch (e) {
    logger.warn(TAG, "get-available-campaign impossible", e);
    return { reason: "suspended" };
  }
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
 * par la Edge Function (jamais par le téléphone).
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
