import React, { useCallback, useState } from "react";
import { Pressable, View, Text } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Bell } from "lucide-react-native";
import { fetchUnreadCount } from "../repositories/notificationRepository";
import { COLORS } from "../constants/theme";

export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchUnreadCount()
        .then((count) => {
          if (active) setUnread(count);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <Pressable
      onPress={() => router.push("/(app)/notifications")}
      hitSlop={10}
      accessibilityLabel="Notifications"
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        opacity: pressed ? 0.7 : 1
      })}
    >
      <Bell color={COLORS.textPrimary} size={20} strokeWidth={2.2} />
      {unread > 0 && (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.danger,
            borderWidth: 1.5,
            borderColor: COLORS.white
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 10, fontFamily: "Inter-Bold" }}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}