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
  /**
   * Réserve la zone système haute à l'intérieur de l'en-tête. À laisser
   * activé (défaut) quand l'écran NE pose pas déjà `paddingTop: insets.top`
   * — sinon l'inset est compté deux fois et l'en-tête descend.
   */
  applyTopInset?: boolean;
  /** En-tête compact : une seule ligne fine, pour gagner de la hauteur. */
  compact?: boolean;
  /** Marge horizontale de l'en-tête (l'écran peut déjà la poser). */
  horizontalPadding?: number;
}

export default function AppHeader({
  title,
  subtitle,
  right,
  showBell = true,
  bottom,
  applyTopInset = true,
  compact = false,
  horizontalPadding = 20
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: applyTopInset ? insets.top + (compact ? 6 : 10) : compact ? 2 : 0,
          paddingHorizontal: horizontalPadding
        }
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          {title ? (
            <Text style={compact ? styles.titleCompact : styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={compact ? styles.subtitleCompact : styles.subtitle} numberOfLines={1}>
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
  wrap: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  left: { flex: 1 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontFamily: "Inter-Bold" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12.5, marginTop: 2, fontFamily: "Inter-Regular" },
  titleCompact: { color: COLORS.textPrimary, fontSize: 17, fontFamily: "Inter-Bold" },
  subtitleCompact: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 1,
    fontFamily: "Inter-Regular"
  },
  right: { flexDirection: "row", alignItems: "center", gap: 10 }
});
