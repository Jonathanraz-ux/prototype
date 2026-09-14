import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { COLORS } from "../constants/theme";

interface StackHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export default function StackHeader({ title, subtitle, right }: StackHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ paddingTop: insets.top + 10 }}>
      <View style={styles.row}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Retour"
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft color={COLORS.textPrimary} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  title: { color: COLORS.textPrimary, fontSize: 20, fontFamily: "Inter-Bold" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" }
});