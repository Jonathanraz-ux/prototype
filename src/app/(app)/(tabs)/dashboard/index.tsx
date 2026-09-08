import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, Animated, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { COLORS, GRADIENTS } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { Play, Power, AlertTriangle, ServerCog } from "lucide-react-native";
import HeroAdCard from "../../../../components/HeroAdCard";
import ConnectionStatusCard from "../../../../components/ConnectionStatusCard";
import RefreshButton from "../../../../components/RefreshButton";

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
    lastSyncAt,
  } = useConnection();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    // Publicité en cours de lecture obligatoire : aucun bouton.
    if (
      state === "ad_loading" ||
      state === "ad_active" ||
      state === "authorizing_wifi" ||
      state === "disconnecting" ||
      currentAd
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
          style={({ pressed }) => [styles.alertButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <LinearGradient colors={GRADIENTS.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.alertButtonText}>Reprendre la session</Text>
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
            style={({ pressed }) => [styles.alertButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <LinearGradient colors={GRADIENTS.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.alertButtonText}>Vérifier le quota</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        onPress={handleConnect}
        disabled={isConnecting}
        style={({ pressed }) => [
          styles.connectWrap,
          {
            opacity: isConnecting ? 0.85 : 1,
            transform: [{ scale: pressed && !isConnecting ? 0.98 : 1 }]
          }
        ]}
      >
        <LinearGradient colors={GRADIENTS.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        {isConnecting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Play color="#FFFFFF" size={20} fill="#FFFFFF" />
            <Text style={styles.connectText}>Regarder la pub et se connecter</Text>
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
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              Bonjour <Text style={{ color: COLORS.accentSoft }}>{user?.firstName ?? ""}</Text>
            </Text>
            <Text style={styles.subtitle}>Connexion financée par la publicité</Text>
            {state !== "idle" && <Text style={styles.subtitle}>{stateLabel}</Text>}
            {reasonLabel && <Text style={styles.reason}>{reasonLabel}</Text>}
          </View>
          <RefreshButton refreshing={isRefreshing} onPress={handleRefresh} />
        </View>

        <View style={{ flex: 1 }}>
          <HeroAdCard />
        </View>

        <ConnectionStatusCard
          connected={isActive}
          connecting={isConnecting}
          percent={percent}
          timeMinutes={usage.remainingTimeMinutes}
          quotaMB={usage.remainingQuotaMB}
          consumedMB={usage.todayConsumptionMB}
          totalQuotaMB={usage.totalQuotaMB}
          networkHealth={networkHealth}
          lastSyncAt={lastSyncAt}
        />

        {renderAction()}

        {(isAdmin || isSiteManager) && (
          <Pressable
            onPress={() => router.push("/(app)/admin" as never)}
            style={({ pressed }) => [styles.adminLink, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ServerCog color={COLORS.textSecondary} size={16} />
            <Text style={styles.adminLinkText}>Espace administrateur</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 20, paddingBottom: 104, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 16 },
  title: { color: "#FFFFFF", fontSize: 27, lineHeight: 34, fontFamily: "Inter-Bold" },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2, fontFamily: "Inter-Regular" },
  reason: { color: COLORS.warning, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" },
  connectWrap: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    shadowColor: "#FF7A00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10
  },
  connectText: { color: "#FFFFFF", fontSize: 15.5, fontFamily: "Inter-Bold" },
  disconnectButton: {
    height: 56,
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
  alertButton: {
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  alertButtonText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter-Bold" },
  adminLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  adminLinkText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: "Inter-Regular" },
  skeleton: { backgroundColor: COLORS.card }
});