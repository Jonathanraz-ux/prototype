import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Animated, RefreshControl } from "react-native";
import RAnimated, { FadeInDown } from "react-native-reanimated";
import { Wifi, Clock, HardDrive, EyeOff, XCircle, AlertTriangle, Power, type LucideIcon } from "lucide-react-native";
import { COLORS, SPACING, ANIMATION_DURATION } from "../../../../constants/theme";
import { fetchHistory } from "../../../../repositories/sessionRepository";
import { REASON_LABELS } from "../../../../services/connectionMachine";
import { formatDate, formatDuration, formatBytes } from "../../../../hooks";
import GlassCard from "../../../../components/GlassCard";
import type { ConnectionHistoryItem, DisconnectReason } from "../../../../types";

const REASON_ICONS: Record<DisconnectReason, LucideIcon> = {
  USER_PAUSED_AD: Power,
  APP_BACKGROUND: EyeOff,
  USER_LOGOUT: Power,
  HEARTBEAT_TIMEOUT: Clock,
  QUOTA_EXHAUSTED: AlertTriangle,
  NETWORK_LOST: XCircle,
  ADMIN_DISCONNECT: Power,
  ROUTER_ERROR: AlertTriangle
};

const REASON_COLORS: Record<DisconnectReason, string> = {
  USER_PAUSED_AD: COLORS.success,
  APP_BACKGROUND: COLORS.warning,
  USER_LOGOUT: COLORS.textMuted,
  HEARTBEAT_TIMEOUT: COLORS.warning,
  QUOTA_EXHAUSTED: COLORS.danger,
  NETWORK_LOST: COLORS.danger,
  ADMIN_DISCONNECT: COLORS.danger,
  ROUTER_ERROR: COLORS.danger
};

export default function HistoryScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "interrupted" | "expired">("all");
  const [history, setHistory] = useState<ConnectionHistoryItem[]>([]);

  const load = useCallback(async () => {
    const items = await fetchHistory();
    setHistory(items);
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
    load().finally(() => setLoading(false));
  }, [fadeAnim, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = filter === "all" ? history : history.filter((h) => h.status === filter);

  const statusLabels: Record<string, string> = {
    completed: "Terminé",
    active: "Actif",
    expired: "Expiré",
    interrupted: "Interrompu"
  };

  const statusColors: Record<string, string> = {
    completed: COLORS.success,
    active: COLORS.primary,
    expired: COLORS.textMuted,
    interrupted: COLORS.warning
  };

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

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingHorizontal: SPACING.screen, paddingTop: 56, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-6">
        <View>
          <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-1" style={{ fontFamily: "Inter-Regular" }}>
            Historique
          </Text>
          <Text className="text-2xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
            Connexions
          </Text>
        </View>

        <View className="flex-row gap-2 bg-zinc-900/80 p-1.5 rounded-2xl border border-white/5">
          {(["all", "completed", "interrupted", "expired"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className="flex-1 py-2.5 rounded-xl items-center"
              style={{ backgroundColor: filter === f ? COLORS.primary : "transparent" }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: filter === f ? COLORS.white : COLORS.textSecondary, fontFamily: "Inter-Bold" }}
              >
                {f === "all" ? "Tout" : statusLabels[f] || f}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="gap-4">
          {filtered.map((item, index) => {
            const ReasonIcon = item.disconnectReason ? REASON_ICONS[item.disconnectReason] : undefined;
            const reasonColor = item.disconnectReason ? REASON_COLORS[item.disconnectReason] : COLORS.textMuted;
            return (
              <RAnimated.View key={item.id} entering={FadeInDown.delay(index * 80).duration(400)}>
                <GlassCard>
                  <View className="flex-row items-center gap-4">
                    <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                      <Wifi color={COLORS.primary} size={22} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm text-white font-semibold mb-0.5" style={{ fontFamily: "Inter-Bold" }}>
                        Session Wi-Fi
                      </Text>
                      <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                        {item.disconnectedAt ? formatDate(item.disconnectedAt) : formatDate(item.connectedAt)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="px-2.5 py-1 rounded-full mb-1" style={{ backgroundColor: `${statusColors[item.status]}20` }}>
                        <Text className="text-xs font-medium" style={{ color: statusColors[item.status], fontFamily: "Inter-Bold" }}>
                          {statusLabels[item.status]}
                        </Text>
                      </View>
                      <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                        {formatDate(item.connectedAt)}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-4 mt-3 pt-3 border-t border-zinc-800">
                    <View className="flex-row items-center gap-1.5">
                      <Clock color={COLORS.textMuted} size={13} />
                      <Text className="text-xs text-zinc-400" style={{ fontFamily: "Inter-Regular" }}>
                        {formatDuration(item.durationMinutes)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <HardDrive color={COLORS.textMuted} size={13} />
                      <Text className="text-xs text-zinc-400" style={{ fontFamily: "Inter-Regular" }}>
                        {item.dataUsedMB ? formatBytes(item.dataUsedMB) : "--"}
                      </Text>
                    </View>
                  </View>

                  {item.disconnectReason ? (
                    <View className="flex-row items-center gap-1.5 mt-2 pt-2 border-t border-zinc-800/50">
                      {ReasonIcon && <ReasonIcon color={reasonColor} size={12} />}
                      <Text className="text-xs" style={{ color: reasonColor, fontFamily: "Inter-Regular" }}>
                        {REASON_LABELS[item.disconnectReason]}
                      </Text>
                    </View>
                  ) : null}
                </GlassCard>
              </RAnimated.View>
            );
          })}
        </View>

        {filtered.length === 0 && (
          <View className="items-center py-16">
            <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${COLORS.textMuted}20` }}>
              <Wifi color={COLORS.textMuted} size={28} />
            </View>
            <Text className="text-zinc-400 text-base" style={{ fontFamily: "Inter-Regular" }}>
              Aucune connexion trouvée
            </Text>
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );
}
