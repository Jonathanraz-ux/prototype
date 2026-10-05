import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Animated, RefreshControl, StyleSheet } from "react-native";
import RAnimated, { FadeInDown } from "react-native-reanimated";
import { Wifi, Clock, HardDrive } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, ANIMATION_DURATION } from "../../src/constants/theme";
import { fetchHistory } from "../../src/repositories/sessionRepository";
import { REASON_LABELS } from "../../src/services/connectionMachine";
import { formatDate } from "../../src/lib/formatDate";
import { formatDuration, formatBytes } from "../ui-kit/format";
import GlassCard from "../../src/components/GlassCard";
import AppHeader from "../../src/components/AppHeader";
import { floatingNavClearance } from "../../src/lib/floatingNav";
import {
  REASON_COLORS,
  REASON_ICONS,
  HISTORY_FILTERS,
  HISTORY_STATUS_COLORS,
  HISTORY_STATUS_LABELS,
  filterHistory,
  historyFilterLabel,
  type HistoryFilter
} from "./historyPresentation";
import type { ConnectionHistoryItem } from "../../src/types";

/**
 * HistoryScreen — ÉCRAN MIS DE CÔTÉ (non routé, non accessible).
 *
 * Il ne vit PLUS dans `src/app/` : aucune route Expo Router active ne mène
 * donc plus à l'historique (ni `/history`, ni `/(app)/(tabs)/history`), et
 * aucun bouton de navigation ne l'ouvre. Les composants et la logique
 * propres à la fonctionnalité sont conservés ici ; les données et la
 * collecte des sessions restent inchangées (`sessionRepository.fetchHistory`,
 * écritures de session et de quota).
 *
 * Voir `src/features/history/README.md` pour la réactivation.
 */
export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");
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

  const filtered = filterHistory(history, filter);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View className="gap-4 px-6">
          {[1, 2, 3].map((i) => (
            <View key={i} className="h-28 rounded-2xl" style={{ backgroundColor: COLORS.surface }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: floatingNavClearance(insets.bottom) + 20
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        <Animated.View style={{ gap: 14, opacity: fadeAnim }}>
          <AppHeader
            title="Historique"
            subtitle="Vos connexions récentes"
            applyTopInset={false}
            horizontalPadding={0}
          />

          <View style={styles.filterRow}>
            {HISTORY_FILTERS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterItem, { backgroundColor: filter === f ? COLORS.actionBg : "transparent" }]}
              >
                <Text
                  style={{
                    color: filter === f ? COLORS.actionFg : COLORS.textSecondary,
                    fontFamily: "Inter-Bold",
                    fontSize: 12
                  }}
                >
                  {historyFilterLabel(f)}
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
                    <View style={styles.row}>
                      <View style={styles.rowIcon}>
                        <Wifi color={COLORS.accent} size={22} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionTitle}>Session Wi-Fi</Text>
                        <Text style={styles.sessionDate}>
                          {item.disconnectedAt ? formatDate(item.disconnectedAt) : formatDate(item.connectedAt)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View style={[styles.badge, { backgroundColor: `${HISTORY_STATUS_COLORS[item.status]}22` }]}>
                          <Text style={{ color: HISTORY_STATUS_COLORS[item.status], fontSize: 11, fontFamily: "Inter-Bold" }}>
                            {HISTORY_STATUS_LABELS[item.status]}
                          </Text>
                        </View>
                        <Text style={styles.sessionDate}>{formatDate(item.connectedAt)}</Text>
                      </View>
                    </View>

                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Clock color={COLORS.textMuted} size={13} />
                        <Text style={styles.metricText}>{formatDuration(item.durationMinutes)}</Text>
                      </View>
                      <View style={styles.metric}>
                        <HardDrive color={COLORS.textMuted} size={13} />
                        <Text style={styles.metricText}>
                          {item.dataUsedMB ? formatBytes(item.dataUsedMB) : "--"}
                        </Text>
                      </View>
                    </View>

                    {item.disconnectReason ? (
                      <View style={styles.reasonRow}>
                        {ReasonIcon && <ReasonIcon color={reasonColor} size={12} />}
                        <Text style={{ color: reasonColor, fontSize: 12, fontFamily: "Inter-Regular" }}>
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
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Wifi color={COLORS.textMuted} size={28} />
              </View>
              <Text style={styles.emptyText}>Aucune connexion trouvée</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    padding: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  filterItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center"
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  sessionTitle: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold" },
  sessionDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 4
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider
  },
  metric: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricText: { color: COLORS.textSecondary, fontSize: 12, fontFamily: "Inter-Regular" },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider
  },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    backgroundColor: COLORS.surface
  },
  emptyText: { color: COLORS.textSecondary, fontSize: 15, fontFamily: "Inter-Regular" }
});
