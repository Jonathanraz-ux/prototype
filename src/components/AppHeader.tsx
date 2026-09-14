import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NotificationBell from "./NotificationBell";
import { COLORS } from "../constants/theme";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  showBell?: boolean;
  bottom?: React.ReactNode;
}

export default function AppHeader({
  title,
  subtitle,
  right,
  showBell = true,
  bottom
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {right}
          {showBell && <NotificationBell />}
        </View>
      </View>
      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  left: { flex: 1 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontFamily: "Inter-Bold" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12.5, marginTop: 2, fontFamily: "Inter-Regular" },
  right: { flexDirection: "row", alignItems: "center", gap: 10 }
});