import React, { useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Wrench } from "lucide-react-native";
import { COLORS } from "../../../constants/theme";
import { isDevModeEnabled } from "../../../lib/config";
import AndroidVpnDemoCard from "../../../components/AndroidVpnDemoCard";

export default function DevScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!isDevModeEnabled()) {
      router.replace("/(app)/(tabs)/dashboard");
    }
  }, [router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Retour"
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft color={COLORS.textPrimary} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Espace de développement</Text>
          <Text style={styles.subtitle}>Outils de test réservés au développement</Text>
        </View>
        <Wrench color={COLORS.textSecondary} size={20} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Accessible uniquement en développement</Text>
          <Text style={styles.noteText}>
            Ces outils ne sont pas exposés dans la version client. Ici vous pouvez piloter le VPN
            de démonstration, simuler la consommation et réinitialiser le quota.
          </Text>
        </View>

        <AndroidVpnDemoCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12
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
  title: { color: COLORS.textPrimary, fontSize: 18, fontFamily: "Inter-Bold" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" },
  note: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.10)",
    padding: 14,
    marginBottom: 14
  },
  noteTitle: { color: COLORS.warning, fontSize: 13, fontFamily: "Inter-Bold" },
  noteText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: "Inter-Regular" }
});