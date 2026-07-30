import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Bell, CheckCheck, AlertTriangle, Wrench, Database, Info } from "lucide-react-native";
import { COLORS, SPACING } from "../../../../constants/theme";
import { MOCK_NOTIFICATIONS } from "../../../../services/mockData";
import { formatDate } from "../../../../hooks";
import { setReadNotifications, getReadNotifications } from "../../../../services/storage";

type Notification = (typeof MOCK_NOTIFICATIONS)[number];

const TYPE_CONFIG = {
  promotion: { bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", color: COLORS.warning, label: "Promo" },
  maintenance: { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", color: COLORS.danger, label: "Maintenance" },
  quota: { bg: "rgba(56, 189, 248, 0.1)", border: "rgba(56, 189, 248, 0.3)", color: COLORS.accent, label: "Quota" },
  system: { bg: "rgba(37, 99, 235, 0.1)", border: "rgba(37, 99, 235, 0.3)", color: COLORS.primary, label: "Système" }
} as const;

const TYPE_ICONS = {
  promotion: AlertTriangle,
  maintenance: Wrench,
  quota: Database,
  system: Info
} as const;

export default function NotificationsScreen() {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const raw = await getReadNotifications();
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          setReadIds(new Set(parsed));
        }
      } catch {}
    })();
  }, []);

  const persistRead = useCallback(async (ids: Set<string>) => {
    try {
      await setReadNotifications(JSON.stringify([...ids]));
    } catch {}
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistRead(next);
      return next;
    });
  }, [persistRead]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    await persistRead(allIds);
  }, [notifications, persistRead]);

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => (filter === "unread" ? !n.read : n.read));

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingHorizontal: SPACING.screen, paddingTop: 56, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View className="gap-6">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-1" style={{ fontFamily: "Inter-Regular" }}>
              Notifications
            </Text>
            <Text className="text-2xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
              {unreadCount > 0 ? `${unreadCount} nouvelle${unreadCount > 1 ? "s" : ""}` : "Tout lu"}
            </Text>
          </View>
          {unreadCount > 0 && (
            <Pressable onPress={markAllAsRead} className="flex-row items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: `${COLORS.primary}15` }}>
              <CheckCheck color={COLORS.primary} size={16} />
              <Text className="text-xs font-semibold" style={{ color: COLORS.primary, fontFamily: "Inter-Bold" }}>
                Tout lu
              </Text>
            </Pressable>
          )}
        </View>

        <View className="flex-row gap-2 bg-zinc-900/80 p-1.5 rounded-2xl border border-white/5">
          {(["all", "unread", "read"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className="flex-1 py-2.5 rounded-xl items-center"
              style={{ backgroundColor: filter === f ? COLORS.primary : "transparent" }}
            >
              <Text className="text-xs font-semibold" style={{ color: filter === f ? COLORS.white : COLORS.textSecondary, fontFamily: "Inter-Bold" }}>
                {f === "all" ? "Tout" : f === "unread" ? "Non lus" : "Lus"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="gap-4">
          {filtered.length === 0 ? (
            <View className="items-center py-16">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${COLORS.textMuted}20` }}>
                <Bell color={COLORS.textMuted} size={28} />
              </View>
              <Text className="text-zinc-400 text-base" style={{ fontFamily: "Inter-Regular" }}>
                Aucune notification
              </Text>
            </View>
          ) : (
            filtered.map((notification, index) => {
              const config = TYPE_CONFIG[notification.type];
              const Icon = TYPE_ICONS[notification.type];
              const isRead = notification.read || readIds.has(notification.id);
              return (
                <Animated.View key={notification.id} entering={FadeInDown.delay(index * 60).duration(350)}>
                  <Pressable
                    onPress={() => markAsRead(notification.id)}
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: isRead ? COLORS.border : config.border, borderLeftWidth: 3, borderLeftColor: config.color }}
                  >
                    {!isRead && (
                      <View className="absolute top-4 right-4">
                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                      </View>
                    )}
                    <View className="p-5">
                      <View className="flex-row items-start gap-3 mb-3">
                        <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: config.bg }}>
                          <Icon color={config.color} size={20} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm text-white font-semibold mb-1" style={{ fontFamily: "Inter-Bold" }}>
                            {notification.title}
                          </Text>
                          <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: config.bg }}>
                            <Text className="text-xs font-medium" style={{ color: config.color, fontFamily: "Inter-Regular" }}>
                              {config.label}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Text className="text-zinc-400 text-sm leading-5 mb-3" style={{ fontFamily: "Inter-Regular" }}>
                        {notification.message}
                      </Text>

                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-zinc-600" style={{ fontFamily: "Inter-Regular" }}>
                          {formatDate(notification.createdAt)}
                        </Text>
                        {notification.action && (
                          <Pressable className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: config.bg }} onPress={() => markAsRead(notification.id)}>
                            <Text className="text-xs font-semibold" style={{ color: config.color, fontFamily: "Inter-Bold" }}>
                              {notification.action.label}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </View>
      </Animated.View>
    </ScrollView>
  );
}
