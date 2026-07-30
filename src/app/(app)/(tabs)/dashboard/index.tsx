import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Animated, Pressable } from "react-native";
import { useRouter } from "expo-router";
import RAnimated, { FadeInDown } from "react-native-reanimated";
import { COLORS, SPACING, ANIMATION_DURATION } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { formatDuration, formatBytes } from "../../../../hooks";
import { getLastRefreshDashboard, setLastRefreshDashboard } from "../../../../services/storage";
import { STATE_LABELS, REASON_LABELS } from "../../../../services/connectionMachine";
import { Activity, Clock, Wifi, WifiOff, RefreshCw, Play, Power, AlertTriangle, EyeOff, Database, Zap } from "lucide-react-native";
import ProgressCircle from "../../../../components/ProgressCircle";
import StatusCard from "../../../../components/StatusCard";
import GlassCard from "../../../../components/GlassCard";
import AdBanner from "../../../../components/AdBanner";

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state, internetStatus, usage, stateLabel, disconnectReason, reasonLabel, connect, disconnect, refillQuota } = useConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
    setTimeout(() => setLoading(false), 600);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getLastRefreshDashboard();
        if (raw) setLastRefresh(raw);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (state === "connecting") setConnecting(true);
    else setConnecting(false);
  }, [state]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLastRefresh(new Date().toISOString());
    await setLastRefreshDashboard(new Date().toISOString());
    setIsRefreshing(false);
  }, []);

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const quotaPercent = (usage.remainingQuotaMB / usage.totalQuotaMB) * 100;
  const timePercent = (usage.remainingTimeMinutes / usage.totalTimeMinutes) * 100;

  const isConnected = state === "connected" || state === "ad_found";
  const isDisconnected = state === "deconnected" || state === "quota_exhausted" || state === "ad_missing" || state === "suspended" || state === "network_error";

  const getStatusColor = () => {
    if (isConnected) return COLORS.success;
    if (state === "connecting") return COLORS.warning;
    if (state === "quota_exhausted") return COLORS.danger;
    if (state === "ad_missing") return COLORS.warning;
    if (state === "suspended") return COLORS.warning;
    if (state === "network_error") return COLORS.danger;
    return COLORS.textMuted;
  };

  const getStatusIcon = () => {
    if (isConnected) return Wifi;
    if (state === "connecting") return RefreshCw;
    return WifiOff;
  };

  const StatusIcon = getStatusIcon();

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[#09090B] px-6 pt-6" contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        <View className="gap-4">
          {[1, 2, 3].map((i) => (
            <View key={i} className="h-28 rounded-2xl" style={{ backgroundColor: COLORS.card }} />
          ))}
        </View>
      </ScrollView>
    );
  }

  const lastRefreshLabel = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-6 px-6 pt-14">
        <View className="flex-row justify-between items-start">
          <View>
            <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-1" style={{ fontFamily: "Inter-Regular" }}>
              Tableau de bord
            </Text>
            <Text className="text-2xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
              Bonjour, {user?.firstName ?? ""}
            </Text>
            {lastRefreshLabel ? (
              <Text className="text-xs text-zinc-500 mt-1" style={{ fontFamily: "Inter-Regular" }}>
                Dernière mise à jour : {lastRefreshLabel}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={handleRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-full items-center justify-center border border-white/10"
            style={{ backgroundColor: COLORS.card, opacity: isRefreshing ? 0.5 : 1 }}
          >
            <RefreshCw color={COLORS.textSecondary} size={18} />
          </Pressable>
        </View>

        <GlassCard>
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-1">
              <Text className="text-sm text-zinc-400 mb-1" style={{ fontFamily: "Inter-Regular" }}>
                Statut de connexion
              </Text>
              <View className="flex-row items-center gap-2 mb-1">
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getStatusColor() }} />
                <Text className="text-lg font-bold" style={{ color: getStatusColor(), fontFamily: "Inter-Bold" }}>
                  {stateLabel}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <StatusIcon color={getStatusColor()} size={12} />
                <Text className="text-xs" style={{ color: getStatusColor(), fontFamily: "Inter-Regular" }}>
                  {internetStatus === "active" ? "Internet actif" : internetStatus === "cut" ? "Internet coupé" : "Internet suspendu"}
                </Text>
              </View>
              {disconnectReason && !isConnected ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <AlertTriangle color={COLORS.warning} size={12} />
                  <Text className="text-xs" style={{ color: COLORS.warning, fontFamily: "Inter-Regular" }}>
                    {reasonLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <ProgressCircle
              progress={quotaPercent}
              size={64}
              strokeWidth={6}
              color={quotaPercent > 75 ? COLORS.warning : COLORS.primary}
            />
          </View>
          <View className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <View className="h-full rounded-full" style={{ width: `${quotaPercent}%`, backgroundColor: quotaPercent > 75 ? COLORS.warning : COLORS.primary }} />
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
              {formatBytes(usage.remainingQuotaMB)} restants
            </Text>
            <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
              {formatBytes(usage.totalQuotaMB)} total
            </Text>
          </View>
        </GlassCard>

        {isConnected && (
          <RAnimated.View entering={FadeInDown.duration(400)}>
            <AdBanner />
          </RAnimated.View>
        )}

        {isConnected && (
          <View className="flex-row gap-3">
            <StatusCard
              title="Temps restant"
              value={formatDuration(usage.remainingTimeMinutes)}
              icon={<Clock color={COLORS.accent} size={20} />}
              subtitle={`sur ${formatDuration(usage.totalTimeMinutes)}`}
            />
            <StatusCard
              title="Vitesse"
              value={formatBytes(usage.downloadSpeedKbps / 1000 * 0.125) + "/s ↓"}
              subtitle={formatBytes(usage.uploadSpeedKbps / 1000 * 0.125) + "/s ↑"}
              icon={<Activity color={COLORS.success} size={20} />}
            />
          </View>
        )}

        {isConnected && (
          <GlassCard>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-sm font-semibold text-white" style={{ fontFamily: "Inter-Bold" }}>
                Consommation
              </Text>
              <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                {formatBytes(usage.todayConsumptionMB)} aujourd'hui
              </Text>
            </View>
            <View className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <View className="h-full rounded-full" style={{ width: `${(usage.todayConsumptionMB / usage.totalQuotaMB) * 100}%`, backgroundColor: COLORS.accent }} />
            </View>
          </GlassCard>
        )}

        {state === "quota_exhausted" ? (
          <RAnimated.View entering={FadeInDown.duration(400)}>
            <GlassCard>
              <View className="items-center py-4 gap-3">
                <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: `${COLORS.warning}20` }}>
                  <AlertTriangle color={COLORS.warning} size={28} />
                </View>
                <Text className="text-lg font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>Quota épuisé</Text>
                <Text className="text-sm text-zinc-400 text-center" style={{ fontFamily: "Inter-Regular" }}>
                  Votre quota Internet est épuisé. Vous pouvez renouveler votre forfait pour retrouver l'accès.
                </Text>
                <Pressable
                  onPress={refillQuota}
                  className="rounded-2xl px-6 py-3 mt-2"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  <Text className="text-sm font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
                    Renouveler le quota
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </RAnimated.View>
        ) : null}

        {state === "ad_missing" ? (
          <RAnimated.View entering={FadeInDown.duration(400)}>
            <GlassCard>
              <View className="items-center py-4 gap-3">
                <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: `${COLORS.warning}20` }}>
                  <EyeOff color={COLORS.warning} size={28} />
                </View>
                <Text className="text-lg font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>Publicité masquée</Text>
                <Text className="text-sm text-zinc-400 text-center" style={{ fontFamily: "Inter-Regular" }}>
                  La publicité obligatoire a été fermée. La connexion Internet a été interrompue.
                </Text>
              </View>
            </GlassCard>
          </RAnimated.View>
        ) : null}

        <View className="gap-3">
          {isDisconnected && state !== "quota_exhausted" && state !== "ad_missing" ? (
            <Pressable
              onPress={handleConnect}
              disabled={connecting}
              className="rounded-2xl py-4 items-center justify-center flex-row gap-2"
              style={{ backgroundColor: COLORS.primary, opacity: connecting ? 0.7 : 1 }}
            >
              {connecting ? (
                <RefreshCw color="#fff" size={20} />
              ) : (
                <Play color="#fff" size={20} />
              )}
              <Text className="text-base font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
                {connecting ? "Connexion en cours..." : "Se connecter"}
              </Text>
            </Pressable>
          ) : null}

          {isConnected ? (
            <Pressable
              onPress={handleDisconnect}
              className="rounded-2xl py-4 items-center justify-center flex-row gap-2"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" }}
            >
              <Power color={COLORS.danger} size={20} />
              <Text className="text-base font-bold" style={{ color: COLORS.danger, fontFamily: "Inter-Bold" }}>
                Se déconnecter
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text className="text-sm font-semibold text-zinc-300" style={{ fontFamily: "Inter-Bold" }}>
          Actions rapides
        </Text>
        <View className="flex-row flex-wrap gap-3">
          {[
            { label: "Quota", icon: Database, color: COLORS.accent, subtitle: "Voir détails" },
            { label: "Historique", icon: Clock, color: COLORS.primary, subtitle: "Connexions" },
            { label: "Vitesse", icon: Zap, color: COLORS.success, subtitle: "Test" },
            { label: "Support", icon: Activity, color: COLORS.warning, subtitle: "Assistance" }
          ].map((action) => (
            <Pressable
              key={action.label}
              className="rounded-2xl border border-white/5 items-center justify-center"
              style={{
                width: "47%",
                backgroundColor: COLORS.card,
                paddingVertical: 20,
                paddingHorizontal: 16
              }}
            >
              <View className="w-12 h-12 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: `${action.color}18` }}>
                <action.icon color={action.color} size={20} />
              </View>
              <Text className="text-white text-sm font-semibold" style={{ fontFamily: "Inter-Bold" }}>
                {action.label}
              </Text>
              <Text className="text-zinc-500 text-xs mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
                {action.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}
