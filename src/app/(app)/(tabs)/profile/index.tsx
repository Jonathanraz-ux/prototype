import React, { useRef, useEffect, useState } from "react";
import { View, Text, ScrollView, Animated, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { User, LogOut, Clock, HardDrive, Sparkles, ChevronRight } from "lucide-react-native";
import { COLORS, SPACING, ANIMATION_DURATION } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { formatDurationFR, formatDataFR } from "../../../../components/ConnectionStatusCard";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { usage } = useConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
    setTimeout(() => setLoading(false), 500);
  }, [fadeAnim]);

  const handleLogout = async () => {
    await logout();
    router.replace("/(public)/welcome");
  };

  if (loading || !user) {
    return (
      <ScrollView className="flex-1 bg-[#09090B] px-6 pt-6" contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        <View className="gap-4">
          {[1, 2].map((i) => (
            <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.card }} />
          ))}
        </View>
      </ScrollView>
    );
  }

  const planLabel = "Standard";

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingHorizontal: SPACING.screen, paddingTop: 56, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-8">
        <View className="items-center">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: "rgba(255, 138, 0, 0.14)", borderWidth: 2, borderColor: COLORS.primary }}
          >
            <User color={COLORS.primaryLight} size={36} />
          </View>
          <Text className="text-xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
            {user.firstName} {user.lastName}
          </Text>
          <Text className="text-sm text-zinc-400 mt-1" style={{ fontFamily: "Inter-Regular" }}>
            {user.email}
          </Text>
          <View className="px-3 py-1 rounded-full mt-3" style={{ backgroundColor: "rgba(255, 138, 0, 0.14)", borderWidth: 1, borderColor: "rgba(255, 138, 0, 0.5)" }}>
            <Text className="text-xs font-medium" style={{ color: COLORS.accentSoft, fontFamily: "Inter-Bold" }}>
              Compte {planLabel}
            </Text>
          </View>
        </View>

        <View className="rounded-3xl border border-white/5 p-5" style={{ backgroundColor: "rgba(24, 24, 27, 0.72)" }}>
          <View className="flex-row items-center gap-2 mb-4">
            <Sparkles color={COLORS.accentSoft} size={14} />
            <Text className="text-xs text-zinc-500 uppercase tracking-widest" style={{ fontFamily: "Inter-Regular" }}>
              Internet financé par la publicité
            </Text>
          </View>
          <View className="gap-4">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: "rgba(255, 138, 0, 0.12)" }}>
                <HardDrive color={COLORS.primaryLight} size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                  Données restantes
                </Text>
                <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                  {formatDataFR(usage.remainingQuotaMB)} sur {formatDataFR(usage.totalQuotaMB)}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: "rgba(255, 138, 0, 0.12)" }}>
                <Clock color={COLORS.accentSoft} size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
                  Temps restant
                </Text>
                <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                  {formatDurationFR(usage.remainingTimeMinutes)} sur {formatDurationFR(usage.totalTimeMinutes)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/(app)/profile/edit")}
          className="rounded-2xl border border-white/5 p-4 flex-row items-center gap-4"
          style={{ backgroundColor: "rgba(24, 24, 27, 0.72)" }}
        >
          <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: "rgba(255, 138, 0, 0.12)" }}>
            <User color={COLORS.primaryLight} size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
              Modifier le profil
            </Text>
            <Text className="text-xs text-zinc-500 mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
              Nom, email, téléphone
            </Text>
          </View>
          <ChevronRight color={COLORS.textMuted} size={18} />
        </Pressable>

        <Pressable
          onPress={handleLogout}
          className="rounded-2xl border border-red-500/20 p-4 flex-row items-center justify-center gap-3"
        >
          <LogOut color={COLORS.danger} size={20} />
          <Text className="text-sm font-semibold text-red-400" style={{ fontFamily: "Inter-Bold" }}>
            Se déconnecter
          </Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}
