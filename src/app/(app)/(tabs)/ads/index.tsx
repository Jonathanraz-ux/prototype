import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Megaphone, Eye, HardDrive, CheckCircle2, Zap } from "lucide-react-native";
import { COLORS, SPACING } from "../../../../constants/theme";
import { fetchActiveCampaigns } from "../../../../repositories/adRepository";
import type { AdCampaign } from "../../../../types";

const STEPS = [
  {
    title: "Regardez la publicité",
    description: "La publicité doit être regardée jusqu'au bout pour financer votre session.",
    icon: Eye
  },
  {
    title: "Votre connexion est financée",
    description: "L'annonceur paie pour votre accès. Vous restez en ligne gratuitement.",
    icon: CheckCircle2
  },
  {
    title: "Restez en ligne, gratuitement",
    description: "Sans abonnement ni engagement. C'est la publicité qui paye pour vous.",
    icon: Zap
  }
];

export default function AdsScreen() {
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<AdCampaign[]>([]);

  useEffect(() => {
    (async () => {
      const campaigns = await fetchActiveCampaigns();
      setAds(campaigns);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-[#09090B] px-6 pt-14">
        <ActivityIndicator color={COLORS.accent} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingHorizontal: SPACING.screen, paddingTop: 56, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-6">
        <View>
          <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-1" style={{ fontFamily: "Inter-Regular" }}>
            Publicités
          </Text>
          <Text className="text-2xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
            Votre Internet, financé par la pub
          </Text>
          <Text className="text-sm text-zinc-400 mt-1" style={{ fontFamily: "Inter-Regular" }}>
            Chaque publicité que vous regardez couvre le coût de votre connexion.
          </Text>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient colors={["#FF7A00", "#FFB35C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.heroIcon}>
            <Megaphone color="#FFFFFF" size={22} />
          </View>
          <Text style={styles.heroTitle}>Faites financer votre Internet</Text>
          <Text style={styles.heroText}>
            Une publicité regardée jusqu'au bout = des heures de connexion gratuites. Simple, transparent.
          </Text>
        </View>

        <View>
          <Text className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "Inter-Bold" }}>
            Comment ça marche
          </Text>
          <View className="gap-3">
            {STEPS.map((step, index) => (
              <View
                key={step.title}
                className="rounded-2xl border border-white/5 p-4 flex-row items-center gap-4"
                style={{ backgroundColor: "rgba(24, 24, 27, 0.72)" }}
              >
                <View
                  className="w-11 h-11 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: `rgba(255, 138, 0, ${0.16 - index * 0.03})` }}
                >
                  <step.icon color={COLORS.primaryLight} size={20} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-white font-semibold" style={{ fontFamily: "Inter-Bold" }}>
                    {index + 1}. {step.title}
                  </Text>
                  <Text className="text-xs text-zinc-500 mt-0.5 leading-4" style={{ fontFamily: "Inter-Regular" }}>
                    {step.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "Inter-Bold" }}>
            Campagnes partenaires
          </Text>
          {ads.length === 0 ? (
            <View className="rounded-2xl border border-white/5 p-6 items-center" style={{ backgroundColor: "rgba(24, 24, 27, 0.72)" }}>
              <Eye color={COLORS.textMuted} size={24} />
              <Text className="text-zinc-400 text-sm mt-2 text-center" style={{ fontFamily: "Inter-Regular" }}>
                Aucune campagne active pour le moment.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {ads.map((ad) => {
                const gradient: [string, string] = ad.gradient
                  ? [ad.gradient[0], ad.gradient[1]]
                  : [ad.background, ad.accentColor];
                return (
                  <View
                    key={ad.id}
                    className="rounded-2xl border border-white/5 overflow-hidden flex-row items-center"
                    style={{ backgroundColor: "rgba(24, 24, 27, 0.72)" }}
                  >
                    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.adSwatch}>
                      <Text style={styles.adInitial}>{ad.advertiserName.charAt(0)}</Text>
                    </LinearGradient>
                    <View className="flex-1 px-4 py-4">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[11px] text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                          {ad.advertiserName}
                        </Text>
                        <View style={[styles.adTypeBadge, { backgroundColor: ad.type === "video" ? "rgba(168, 85, 247, 0.16)" : "rgba(255, 138, 0, 0.16)" }]}>
                          <Text style={[styles.adTypeBadgeText, { color: ad.type === "video" ? "#C084FC" : COLORS.primaryLight }]}>
                            {ad.type === "video" ? "VIDÉO" : "IMAGE"}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-sm text-white font-semibold mt-0.5" numberOfLines={2} style={{ fontFamily: "Inter-Bold" }}>
                        {ad.title}
                      </Text>
                      <Text className="text-xs text-zinc-500 mt-1" style={{ fontFamily: "Inter-Regular" }}>
                        {ad.durationSeconds} s · {ad.rewardValue}
                        {ad.rewardType === "minutes" ? " min" : ad.rewardType === "megabytes" ? " Mo" : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
    shadowColor: "#FF7A00",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 14
  },
  heroTitle: { color: "#FFFFFF", fontSize: 19, fontFamily: "Inter-Bold" },
  heroText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    fontFamily: "Inter-Regular"
  },
  adSwatch: { width: 76, height: 76, alignItems: "center", justifyContent: "center" },
  adTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  adTypeBadgeText: { fontSize: 8, fontWeight: "700", letterSpacing: 0.6, fontFamily: "Inter-Bold" },
  adInitial: { color: "rgba(255,255,255,0.95)", fontSize: 26, fontFamily: "Inter-Bold" }
});
