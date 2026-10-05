import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, Animated, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { Play, Power, AlertTriangle, ServerCog, Wrench, RefreshCw } from "lucide-react-native";
import HeroAdCard from "../../../../components/HeroAdCard";
import ConnectionStatusCard from "../../../../components/ConnectionStatusCard";
import AppHeader from "../../../../components/AppHeader";
import AccountSection from "../../../../components/AccountSection";
import RefreshButton from "../../../../components/RefreshButton";
import { isDevModeEnabled } from "../../../../lib/config";
import { floatingNavClearance } from "../../../../lib/floatingNav";
import { ScrollView } from "react-native";

export default function DashboardScreen() {
  const { user, isAdmin, isSiteManager } = useAuth();
  const {
    state,
    internetStatus,
    usage,
    stateLabel,
    reasonLabel,
    connect,
    disconnect,
    refillQuota,
    currentAd,
    networkHealth,
    networkProviderKind,
    networkAgentSimulated,
    networkDetailVerified,
    lastSyncAt,
    isResuming,
  } = useConnection();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const devEnabled = isDevModeEnabled();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, [fadeAnim]);

  const isConnecting = state === "ad_loading" || state === "authorizing_wifi";
  const isActive = internetStatus === "active";

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setIsRefreshing(false);
  }, []);

  const handleConnect = () => {
    void connect();
  };

  const handleDisconnect = () => {
    void disconnect();
  };

  const percent = usage.totalQuotaMB > 0 ? (usage.remainingQuotaMB / usage.totalQuotaMB) * 100 : 0;

  const renderAction = () => {
    if (
      state === "ad_loading" ||
      state === "ad_active" ||
      state === "disconnecting" ||
      (state === "idle" && currentAd)
    ) {
      return null;
    }

    if (state === "wifi_active") {
      return (
        <Pressable
          onPress={handleDisconnect}
          style={({ pressed }) => [styles.disconnectButton, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <Power color={COLORS.danger} size={18} />
          <Text style={styles.disconnectText}>Se déconnecter</Text>
        </Pressable>
      );
    }

    if (state === "paused") {
      return (
        <Pressable
          onPress={handleConnect}
          disabled={isResuming}
          style={({ pressed }) => [
            styles.actionButton,
            {
              opacity: isResuming ? 0.85 : 1,
              transform: [{ scale: pressed && !isResuming ? 0.97 : 1 }],
            },
          ]}
        >
          {isResuming ? (
            <ActivityIndicator size="small" color={COLORS.actionFg} />
          ) : (
            <Text style={styles.actionButtonText}>Reprendre la session</Text>
          )}
        </Pressable>
      );
    }

    if (state === "quota_exhausted") {
      return (
        <View style={styles.alertWrap}>
          <View style={styles.alertRow}>
            <AlertTriangle color={COLORS.warning} size={16} />
            <Text style={styles.alertText} numberOfLines={1}>
              Quota épuisé — la réinitialisation est réservée à un administrateur
            </Text>
          </View>
          <Pressable
            onPress={() => void refillQuota()}
            style={({ pressed }) => [styles.actionButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <Text style={styles.actionButtonText}>Vérifier le quota</Text>
          </Pressable>
        </View>
      );
    }

    if (state === "authorizing_wifi") {
      // Cul-de-sac : autorisation restée sans aboutissement. Le bouton
      // relance proprement la connexion (connect() repart de idle).
      return (
        <Pressable
          onPress={handleConnect}
          style={({ pressed }) => [styles.actionButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <RefreshCw color={COLORS.actionFg} size={20} />
          <Text style={styles.actionButtonText}>Réessayer l'autorisation Wi-Fi</Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={handleConnect}
        disabled={isConnecting}
        style={({ pressed }) => [
          styles.actionButton,
          {
            opacity: isConnecting ? 0.85 : 1,
            transform: [{ scale: pressed && !isConnecting ? 0.98 : 1 }]
          }
        ]}
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color={COLORS.actionFg} />
        ) : (
          <>
            <Play color={COLORS.actionFg} size={20} fill={COLORS.actionFg} />
            <Text style={styles.actionButtonText}>Regarder la pub et se connecter</Text>
          </>
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.container}>
          <View className="gap-2">
            <View style={styles.skeleton} className="w-24 h-3 rounded" />
            <View style={styles.skeleton} className="w-44 h-6 rounded" />
          </View>
          <View style={[styles.skeleton, { flex: 1, borderRadius: 28 }]} />
          <View style={styles.skeleton} className="h-36 rounded-3xl" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          // Espace de défilement réel : le bouton « Se déconnecter » (fin de
          // la section « Mon compte ») reste au-dessus des boutons flottants
          // Accueil / Naviguer, qui sont superposés en bas d'écran.
          { paddingBottom: floatingNavClearance(insets.bottom) + 20 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ gap: 14, opacity: fadeAnim }}>
          <AppHeader
            title={`Bonjour ${user?.firstName ?? ""}`}
            subtitle="Connexion financée par la publicité"
            right={<RefreshButton refreshing={isRefreshing} onPress={handleRefresh} />}
            applyTopInset={false}
            horizontalPadding={0}
          />

          <ConnectionStatusCard
            connected={isActive}
            connecting={isConnecting}
            percent={percent}
            timeMinutes={usage.remainingTimeMinutes}
            quotaMB={usage.remainingQuotaMB}
            consumedMB={usage.todayConsumptionMB}
            totalQuotaMB={usage.totalQuotaMB}
            networkHealth={networkHealth}
            providerKind={networkProviderKind}
            agentSimulated={networkAgentSimulated}
            detailVerified={networkDetailVerified}
            lastSyncAt={lastSyncAt}
            meterTrusted={
              networkDetailVerified &&
              networkProviderKind === "live" &&
              !networkAgentSimulated
            }
          />

          <View style={{ height: 260 }}>
            <HeroAdCard />
          </View>

          {state !== "idle" && <Text style={styles.stateNote}>{stateLabel}</Text>}
          {reasonLabel && <Text style={styles.reason}>{reasonLabel}</Text>}

          {renderAction()}

          {(isAdmin || isSiteManager) && (
            <Pressable
              onPress={() => router.push("/(app)/admin" as never)}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ServerCog color={COLORS.textSecondary} size={16} />
              <Text style={styles.linkText}>Espace administrateur</Text>
            </Pressable>
          )}

          {devEnabled && (
            <Pressable
              onPress={() => router.push("/(app)/dev")}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Wrench color={COLORS.textSecondary} size={16} />
              <Text style={styles.linkText}>Espace de développement</Text>
            </Pressable>
          )}

          {/* Section « Mon compte » : toutes les informations et actions de
              l'ancien écran Profil, dont « Se déconnecter » en dernière
              position (défilement nécessaire, jamais masqué par les boutons
              flottants). */}
          <AccountSection />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  stateNote: { color: COLORS.textMuted, fontSize: 12.5, textAlign: "center", fontFamily: "Inter-Regular" },
  reason: { color: COLORS.warning, fontSize: 12, textAlign: "center", fontFamily: "Inter-Regular" },
  actionButton: {
    minHeight: 56,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.actionBg,
    shadowColor: COLORS.backgroundDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10
  },
  actionButtonText: { color: COLORS.actionFg, fontSize: 15.5, fontFamily: "Inter-Bold" },
  disconnectButton: {
    minHeight: 56,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)"
  },
  disconnectText: { color: COLORS.danger, fontSize: 15.5, fontFamily: "Inter-Bold" },
  alertWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    padding: 14,
    gap: 12
  },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertText: { flex: 1, color: COLORS.warning, fontSize: 13, fontFamily: "Inter-Regular" },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  linkText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: "Inter-Regular" },
  skeleton: { backgroundColor: COLORS.surface }
});