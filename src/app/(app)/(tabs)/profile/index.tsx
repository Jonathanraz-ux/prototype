import React, { useRef, useEffect, useState } from "react";
import { View, Text, ScrollView, Animated, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  User,
  ChevronRight,
  LogOut,
  QrCode,
  Settings,
  HelpCircle,
  Shield,
  Bell,
  Globe,
  Info,
  Calendar,
  Database,
  Clock,
  Edit3
} from "lucide-react-native";
import { COLORS, SPACING, ANIMATION_DURATION } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthContext";
import { useConnection } from "../../../../contexts/ConnectionContext";
import { QuotaService } from "../../../../services/quota";
import { formatBytes, formatDuration } from "../../../../hooks";
import GlassCard from "../../../../components/GlassCard";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { usage } = useConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
    setTimeout(() => setLoading(false), 500);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/(public)/welcome");
  };

  const menuSections = [
    {
      title: "Compte",
      items: [
        { title: "Modifier le profil", subtitle: "Nom, email, téléphone", icon: Edit3, route: "/(app)/profile/edit", color: COLORS.accent },
        { title: "Notifications", subtitle: "Préférences de notification", icon: Bell, route: "/(app)/(tabs)/notifications", color: COLORS.warning },
        { title: "Appareil", subtitle: "Samsung Galaxy S24 Ultra", icon: QrCode, color: COLORS.accent }
      ]
    },
    {
      title: "Préférences",
      items: [
        { title: "Paramètres", subtitle: "Général, sécurité", icon: Settings, route: "/(app)/(tabs)/settings", color: COLORS.textSecondary },
        { title: "Langue", subtitle: "Français", icon: Globe, route: "/(app)/(tabs)/settings", color: COLORS.accent },
        { title: "Confidentialité", subtitle: "Données personnelles", icon: Shield, route: "/(app)/(tabs)/settings", color: COLORS.success }
      ]
    },
    {
      title: "Support",
      items: [
        { title: "Aide & Support", subtitle: "FAQ, contact", icon: HelpCircle, route: "/(app)/(tabs)/settings", color: COLORS.textMuted },
        { title: "À propos", subtitle: "WiFi Zone v1.0.0", icon: Info, route: "/(app)/(tabs)/settings", color: COLORS.textSecondary }
      ]
    }
  ];

  if (loading || !user) {
    return (
      <ScrollView className="flex-1 bg-[#09090B] px-6 pt-6" contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        <View className="gap-4">
          {[1, 2, 3].map((i) => (
            <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.card }} />
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
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-8">
        <View className="items-center">
          <View className="w-24 h-24 rounded-full items-center justify-center mb-4" style={{ backgroundColor: `${COLORS.primary}20`, borderWidth: 2, borderColor: COLORS.primary }}>
            <View className="w-full h-full rounded-full items-center justify-center">
              <User color={COLORS.primary} size={36} />
            </View>
          </View>
          <Text className="text-xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
            {user.firstName} {user.lastName}
          </Text>
          <Text className="text-sm text-zinc-400 mt-1" style={{ fontFamily: "Inter-Regular" }}>
            {user.email}
          </Text>
          <Text className="text-xs text-zinc-500 mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
            {user.phone}
          </Text>
          <View className="px-3 py-1 rounded-full mt-3" style={{ backgroundColor: `${COLORS.accent}15`, borderWidth: 1, borderColor: COLORS.accent }}>
            <Text className="text-xs font-medium" style={{ color: COLORS.accent, fontFamily: "Inter-Bold" }}>
              Plan {user.plan === "enterprise" ? "Enterprise" : user.plan === "pro" ? "Pro" : "Free"}
            </Text>
          </View>
        </View>

        <GlassCard>
          <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4" style={{ fontFamily: "Inter-Regular" }}>
            Informations compte
          </Text>
          <View className="gap-4">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${COLORS.accent}15` }}>
                <Calendar color={COLORS.accent} size={18} />
              </View>
              <View>
                <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>Inscrit depuis</Text>
                <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                  {new Date(user.createdAt).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                <Database color={COLORS.primary} size={18} />
              </View>
              <View>
                <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>Quota restant</Text>
                <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                  {formatBytes(usage.remainingQuotaMB)} / {formatBytes(usage.totalQuotaMB)}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${COLORS.success}15` }}>
                <Clock color={COLORS.success} size={18} />
              </View>
              <View>
                <Text className="text-xs text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>Temps restant</Text>
                <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                  {formatDuration(usage.remainingTimeMinutes)}
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {menuSections.map((section) => (
          <View key={section.title}>
            <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-3 px-1" style={{ fontFamily: "Inter-Regular" }}>
              {section.title}
            </Text>
            <View className="gap-2">
              {section.items.map((item) => (
                <Pressable
                  key={item.title}
                  onPress={() => item.route ? router.push(item.route as any) : undefined}
                  className="rounded-2xl border border-white/5 p-4 flex-row items-center gap-4"
                  style={{ backgroundColor: COLORS.card }}
                >
                  <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${item.color}15` }}>
                    <item.icon color={item.color} size={20} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
                      {item.title}
                    </Text>
                    <Text className="text-xs text-zinc-500 mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <ChevronRight color={COLORS.textMuted} size={18} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={handleLogout}
          className="rounded-2xl border border-red-500/20 p-4 flex-row items-center justify-center gap-3 mt-4"
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
