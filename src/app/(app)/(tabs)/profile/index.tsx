import React, { useRef, useEffect, useState } from "react";
import { View, Text, ScrollView, Animated, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { User, LogOut, Clock, HardDrive, Sparkles, ChevronRight, Cog } from "lucide-react-native";
import { COLORS, ANIMATION_DURATION } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { formatDurationFR, formatDataFR } from "../../../../components/ConnectionStatusCard";
import AppHeader from "../../../../components/AppHeader";
import { TAB_BAR_CLEARANCE, TAB_BAR_MARGIN } from "../../../../lib/tabBarMetrics";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { usage, networkProviderKind } = useConnection();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
    setTimeout(() => setLoading(false), 500);
  }, [fadeAnim]);

  const handleLogout = async () => {
    await logout();
    router.replace("/(public)/welcome");
  };

  if (loading || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View className="gap-4 px-6">
          {[1, 2].map((i) => (
            <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.surface }} />
          ))}
        </View>
      </View>
    );
  }

  const planLabel = "Standard";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + TAB_BAR_MARGIN }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ gap: 8, opacity: fadeAnim }}>
          <AppHeader title="Profil" showBell={false} />

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <User color={COLORS.textPrimary} size={36} />
            </View>
            <Text style={styles.name}>
              {user.firstName} {user.lastName}
            </Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>Compte {planLabel}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Sparkles color={COLORS.accent} size={14} />
              <Text style={styles.cardHeaderText}>Internet financé par la publicité</Text>
            </View>
            {networkProviderKind === "live" ? (
              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <View style={styles.metricIcon}>
                    <HardDrive color={COLORS.accent} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metricLabel}>Données restantes</Text>
                    <Text style={styles.metricValue}>
                      {formatDataFR(usage.remainingQuotaMB)} sur {formatDataFR(usage.totalQuotaMB)}
                    </Text>
                  </View>
                </View>
                <View style={styles.metric}>
                  <View style={styles.metricIcon}>
                    <Clock color={COLORS.accent} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metricLabel}>Temps restant</Text>
                    <Text style={styles.metricValue}>
                      {formatDurationFR(usage.remainingTimeMinutes)} sur {formatDurationFR(usage.totalTimeMinutes)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.honestRow}>
                <HardDrive color={COLORS.primaryLight} size={14} />
                <Text style={styles.honestText}>
                  Bôjô offre un quota de 5 Go. Le comptage sera mesuré par le routeur
                  (MikroTik) lors de la phase définitive — les compteurs ne sont pas
                  encore actifs en mode provisoire.
                </Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={() => router.push("/(app)/profile/edit")}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.rowIcon}>
              <User color={COLORS.accent} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Modifier le profil</Text>
              <Text style={styles.rowSubtitle}>Nom, email, téléphone</Text>
            </View>
            <ChevronRight color={COLORS.textMuted} size={18} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/(app)/settings")}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.rowIcon}>
              <Cog color={COLORS.accent} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Paramètres</Text>
              <Text style={styles.rowSubtitle}>Thème, langue, notifications</Text>
            </View>
            <ChevronRight color={COLORS.textMuted} size={18} />
          </Pressable>

          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <LogOut color={COLORS.danger} size={20} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  avatarWrap: { alignItems: "center", marginTop: 8, marginBottom: 18 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)"
  },
  name: { color: COLORS.textPrimary, fontSize: 20, fontFamily: "Inter-Bold" },
  email: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3, fontFamily: "Inter-Regular" },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 10,
    backgroundColor: COLORS.actionBg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)"
  },
  planBadgeText: { color: COLORS.actionFg, fontSize: 12, fontFamily: "Inter-Bold" },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 18,
    marginTop: 6
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  cardHeaderText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Inter-Bold"
  },
  metrics: { gap: 16 },
  metric: { flexDirection: "row", alignItems: "center", gap: 12 },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  metricLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter-Regular" },
  metricValue: { color: COLORS.textPrimary, fontSize: 14, marginTop: 2, fontFamily: "Inter-Bold" },
  honestRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 12
  },
  honestText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter-Regular"
  },
  row: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 10
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  rowTitle: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold" },
  rowSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" },
  logoutButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 18
  },
  logoutText: { color: COLORS.danger, fontSize: 14, fontFamily: "Inter-Bold" }
});