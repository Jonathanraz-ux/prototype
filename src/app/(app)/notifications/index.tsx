import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, CheckCheck, Wrench, Database, Info, Megaphone } from "lucide-react-native";
import { COLORS } from "../../../constants/theme";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../../../repositories/notificationRepository";
import { formatDate } from "../../../lib/formatDate";
import StackHeader from "../../../components/StackHeader";
import type { AppNotification } from "../../../types";

const TYPE_CONFIG: Record<AppNotification["type"], { bg: string; border: string; color: string; label: string }> = {
  promotion: { bg: "rgba(245, 158, 11, 0.14)", border: "rgba(245, 158, 11, 0.4)", color: COLORS.warning, label: "Promo" },
  maintenance: { bg: "rgba(239, 68, 68, 0.14)", border: "rgba(239, 68, 68, 0.4)", color: COLORS.danger, label: "Maintenance" },
  quota: { bg: "rgba(201, 180, 255, 0.14)", border: "rgba(201, 180, 255, 0.4)", color: COLORS.accent, label: "Quota" },
  system: { bg: "rgba(125, 69, 246, 0.2)", border: "rgba(125, 69, 246, 0.4)", color: COLORS.primaryLight, label: "Système" }
};

const TYPE_ICONS: Record<AppNotification["type"], typeof Info> = {
  promotion: Megaphone,
  maintenance: Wrench,
  quota: Database,
  system: Info
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const items = await fetchNotifications();
      setNotifications(items);
      setLoading(false);
    })();
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await markNotificationRead(id);
  }, []);

  const markAll = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }, []);

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => (filter === "unread" ? !n.read : n.read));

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StackHeader
        title="Notifications"
        subtitle={unreadCount === 0 ? "Tout est à jour" : `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`}
        right={
          unreadCount > 0 ? (
            <Pressable
              onPress={markAll}
              accessibilityLabel="Marquer tout comme lu"
              style={({ pressed }) => [styles.markAll, { opacity: pressed ? 0.7 : 1 }]}
            >
              <CheckCheck color={COLORS.textPrimary} size={16} />
              <Text style={styles.markAllText}>Tout lu</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="gap-4 mt-3">
            {[1, 2, 3].map((i) => (
              <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.surface }} />
            ))}
          </View>
        ) : (
          <Animated.View className="gap-6 mt-3">
            <View style={styles.filterRow}>
              {(["all", "unread", "read"] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.filterItem, { backgroundColor: filter === f ? COLORS.actionBg : "transparent" }]}
                >
                  <Text style={{ color: filter === f ? COLORS.actionFg : COLORS.textSecondary, fontFamily: "Inter-Bold" }}>
                    {f === "all" ? "Tout" : f === "unread" ? "Non lus" : "Lus"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="gap-4">
              {filtered.length === 0 ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Bell color={COLORS.textMuted} size={28} />
                  </View>
                  <Text style={styles.emptyText}>Aucune notification</Text>
                </View>
              ) : (
                filtered.map((notification, index) => {
                  const config = TYPE_CONFIG[notification.type];
                  const Icon = TYPE_ICONS[notification.type];
                  return (
                    <Animated.View key={notification.id} entering={FadeInDown.delay(index * 60).duration(350)}>
                      <Pressable
                        onPress={() => markAsRead(notification.id)}
                        style={{
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: notification.read ? COLORS.border : config.border,
                          borderLeftWidth: 3,
                          borderLeftColor: config.color,
                          backgroundColor: "rgba(255,255,255,0.12)"
                        }}
                      >
                        {!notification.read && (
                          <View style={styles.unreadDotWrap}>
                            <View style={[styles.unreadDot, { backgroundColor: config.color }]} />
                          </View>
                        )}
                        <View style={{ padding: 18 }}>
                          <View style={styles.row}>
                            <View style={[styles.rowIcon, { backgroundColor: config.bg }]}>
                              <Icon color={config.color} size={20} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.title} numberOfLines={2}>
                                {notification.title}
                              </Text>
                              <View style={[styles.typeBadge, { backgroundColor: config.bg }]}>
                                <Text style={{ color: config.color, fontSize: 11, fontFamily: "Inter-Regular" }}>
                                  {config.label}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.body}>{notification.body}</Text>
                          <Text style={styles.date}>{formatDate(notification.createdAt)}</Text>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })
              )}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  markAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  markAllText: { color: COLORS.textPrimary, fontSize: 12, fontFamily: "Inter-Bold" },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    padding: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  filterItem: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center", fontSize: 12 },
  unreadDotWrap: { position: "absolute", top: 16, right: 16 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  title: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold", marginBottom: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  body: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: "Inter-Regular" },
  date: { color: COLORS.textMuted, fontSize: 11.5, marginTop: 10, fontFamily: "Inter-Regular" },
  empty: { alignItems: "center", paddingVertical: 48 },
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