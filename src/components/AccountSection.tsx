import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { User, LogOut, Clock, HardDrive, Sparkles, ChevronRight, Cog } from "lucide-react-native";
import { COLORS, RADIUS } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useConnection } from "../contexts/ConnectionContext";
import { formatDurationFR, formatDataFR } from "./ConnectionStatusCard";

const PLAN_LABEL = "Standard";

/**
 * AccountSection — Section « Mon compte » de l'écran Accueil.
 *
 * Remplace l'ancien écran Profil (onglet et route supprimés) : toutes ses
 * informations (identité, quota, durée de session) et toutes ses actions
 * (modifier le profil, paramètres, se déconnecter) sont désormais intégrées
 * ici, en BAS de la page d'accueil. L'écran Accueil est défilant et réserve
 * la hauteur exacte des boutons flottants : le bouton « Se déconnecter » est
 * donc toujours atteignable, jamais masqué.
 *
 * La déconnexion réutilise la VRAIE logique existante : `logout()` de
 * AuthContext (désactivation du push + fermeture de session Supabase +
 * effacement de l'utilisateur), puis retour à l'écran d'accueil public.
 */
export default function AccountSection() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { usage, networkProviderKind, networkAgentSimulated, networkDetailVerified } =
    useConnection();
  const [loggingOut, setLoggingOut] = useState(false);

  // Mêmes règles que ConnectionStatusCard : « live » ne vient que de la
  // configuration locale, et l'agent peut être un simulateur. Sans ces deux
  // conditions, cet écran affichait « 0 min sur 0 min » juste à côté du
  // libellé « Routeur simulé » de la carte d'état.
  const countersTrusted =
    networkDetailVerified && networkProviderKind === "live" && !networkAgentSimulated;

  if (!user) return null;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/(public)/welcome");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Mon compte</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <User color={COLORS.textPrimary} size={30} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {user.firstName} {user.lastName}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>Compte {PLAN_LABEL}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Sparkles color={COLORS.accent} size={14} />
          <Text style={styles.cardHeaderText}>Internet financé par la publicité</Text>
        </View>
        {countersTrusted ? (
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
                  {formatDurationFR(usage.remainingTimeMinutes)} sur{" "}
                  {formatDurationFR(usage.totalTimeMinutes)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.honestRow}>
            <HardDrive color={COLORS.primaryLight} size={14} />
            <Text style={styles.honestText}>
              Bôjô offre un quota de 5 Go. Le comptage sera mesuré par le routeur (MikroTik) lors
              de la phase définitive — les compteurs ne sont pas encore actifs en mode provisoire.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => router.push("/(app)/profile/edit")}
        accessibilityRole="button"
        accessibilityLabel="Modifier le profil"
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
        accessibilityRole="button"
        accessibilityLabel="Paramètres"
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
        disabled={loggingOut}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
        style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
      >
        {loggingOut ? (
          <ActivityIndicator size="small" color={COLORS.danger} />
        ) : (
          <LogOut color={COLORS.danger} size={20} />
        )}
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 6 },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Inter-Bold"
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)"
  },
  name: { color: COLORS.textPrimary, fontSize: 16, fontFamily: "Inter-Bold" },
  email: { color: COLORS.textSecondary, fontSize: 12.5, marginTop: 2, fontFamily: "Inter-Regular" },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.actionBg
  },
  planBadgeText: { color: COLORS.actionFg, fontSize: 11, fontFamily: "Inter-Bold" },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 16
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  cardHeaderText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Inter-Bold"
  },
  metrics: { gap: 14 },
  metric: { flexDirection: "row", alignItems: "center", gap: 12 },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  metricLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter-Regular" },
  metricValue: { color: COLORS.textPrimary, fontSize: 13.5, marginTop: 2, fontFamily: "Inter-Bold" },
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
    gap: 14
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
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 4
  },
  logoutText: { color: COLORS.danger, fontSize: 14, fontFamily: "Inter-Bold" }
});
