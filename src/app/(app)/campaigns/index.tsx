import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Megaphone, Eye, HardDrive, CheckCircle2, Zap } from "lucide-react-native";
import { COLORS } from "../../../constants/theme";
import { fetchActiveCampaigns } from "../../../repositories/adRepository";
import StackHeader from "../../../components/StackHeader";
import type { AdCampaign } from "../../../types";

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

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<AdCampaign[]>([]);

  useEffect(() => {
    (async () => {
      const campaigns = await fetchActiveCampaigns();
      setAds(campaigns);
      setLoading(false);
    })();
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StackHeader title="Annonces partenaires" subtitle="Votre Internet, financé par la pub" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6">
          <Text style={styles.intro}>
            Chaque publicité que vous regardez couvre le coût de votre connexion.
          </Text>

          <View style={styles.heroCard}>
            <LinearGradient colors={["#7D45F6", "#9F7BFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.heroIcon}>
              <Megaphone color="#FFFFFF" size={22} />
            </View>
            <Text style={styles.heroTitle}>Faites financer votre Internet</Text>
            <Text style={styles.heroText}>
              Une publicité regardée jusqu'au bout = des heures de connexion gratuites. Simple, transparent.
            </Text>
          </View>

          <View>
            <Text style={styles.blockTitle}>Comment ça marche</Text>
            <View className="gap-3">
              {STEPS.map((step, index) => (
                <View
                  key={step.title}
                  style={styles.stepCard}
                >
                  <View style={styles.stepIcon}>
                    <step.icon color={COLORS.accent} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{index + 1}. {step.title}</Text>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View>
            <Text style={styles.blockTitle}>Campagnes partenaires</Text>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : ads.length === 0 ? (
              <View style={styles.noCampaign}>
                <Eye color={COLORS.textMuted} size={24} />
                <Text style={styles.noCampaignText}>
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
                    <View key={ad.id} style={styles.adCard}>
                      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.adSwatch}>
                        <Text style={styles.adInitial}>{ad.advertiserName.charAt(0)}</Text>
                      </LinearGradient>
                      <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
                        <View style={styles.adMetaRow}>
                          <Text style={styles.adAdvertiser}>{ad.advertiserName}</Text>
                          <View style={[styles.adTypeBadge, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
                            <Text style={styles.adTypeBadgeText}>
                              {ad.type === "video" ? "VIDÉO" : "IMAGE"}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.adTitle} numberOfLines={2}>{ad.title}</Text>
                        <Text style={styles.adMeta}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  intro: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter-Regular"
  },
  heroCard: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
    shadowColor: COLORS.backgroundDark,
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
  blockTitle: { color: COLORS.textPrimary, fontSize: 15, fontFamily: "Inter-Bold", marginBottom: 12 },
  stepCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  stepTitle: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold" },
  stepDescription: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 2, fontFamily: "Inter-Regular" },
  adCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  adSwatch: { width: 76, height: 76, alignItems: "center", justifyContent: "center" },
  adInitial: { color: "rgba(255,255,255,0.95)", fontSize: 26, fontFamily: "Inter-Bold" },
  adMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  adAdvertiser: { color: COLORS.textSecondary, fontSize: 11, fontFamily: "Inter-Regular" },
  adTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  adTypeBadgeText: { color: COLORS.textPrimary, fontSize: 8, letterSpacing: 0.6, fontFamily: "Inter-Bold" },
  adTitle: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold", marginTop: 4 },
  adMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontFamily: "Inter-Regular" },
  loadingRow: { paddingVertical: 32, alignItems: "center" },
  noCampaign: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  noCampaignText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 10, textAlign: "center", fontFamily: "Inter-Regular" }
});