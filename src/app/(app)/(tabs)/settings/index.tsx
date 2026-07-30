import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Animated, Pressable, Switch } from "react-native";
import {
  Moon,
  Globe,
  Info,
  ChevronRight,
  HelpCircle,
  Lock,
  FileText,
  Shield,
  Bell,
  LogOut
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS, SPACING, ANIMATION_DURATION } from "../../../../constants/theme";
import { getSettings, setSettings } from "../../../../services/storage";
import { useAuth } from "../../../../contexts/AuthContext";
import GlassCard from "../../../../components/GlassCard";

interface SettingsState {
  darkTheme: boolean;
  language: string;
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  darkTheme: true,
  language: "fr",
  notificationsEnabled: true
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-3 px-1" style={{ fontFamily: "Inter-Regular" }}>
        {title}
      </Text>
      <GlassCard style={{ padding: 4 }}>
        {children}
      </GlassCard>
    </View>
  );
}

function SettingRow({
  label,
  description,
  value,
  onToggle,
  icon: Icon,
  color
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  icon?: React.ComponentType<{ color: string; size: number }>;
  color?: string;
}) {
  return (
    <View className="flex-row items-center gap-4 p-4 rounded-2xl">
      <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color || COLORS.primary}15` }}>
        {Icon && <Icon color={color || COLORS.primary} size={20} />}
      </View>
      <View className="flex-1">
        <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
          {label}
        </Text>
        <Text className="text-xs text-zinc-500 mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: COLORS.border, true: COLORS.primary }} thumbColor="#fff" />
    </View>
  );
}

function InfoRow({
  label,
  description,
  icon: Icon,
  color,
  onPress
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ color: string; size: number }>;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-4 p-4 rounded-2xl">
      <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <Icon color={color} size={20} />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-white font-medium" style={{ fontFamily: "Inter-Regular" }}>
          {label}
        </Text>
        <Text className="text-xs text-zinc-500 mt-0.5" style={{ fontFamily: "Inter-Regular" }}>
          {description}
        </Text>
      </View>
      <ChevronRight color={COLORS.textMuted} size={18} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [settings, setSettingsState] = useState<SettingsState>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getSettings();
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SettingsState>;
          setSettingsState({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIMATION_DURATION.slow, useNativeDriver: true }).start();
  }, []);

  const toggle = useCallback(async (key: keyof SettingsState) => {
    setSettingsState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setSettings(JSON.stringify(next));
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/(public)/welcome");
  };

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[#09090B] px-6 pt-6" contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        <View className="gap-4">
          {[1, 2, 3, 4].map((i) => (
            <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.card }} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#09090B]"
      contentContainerStyle={{ paddingHorizontal: SPACING.screen, paddingTop: 56, paddingBottom: SPACING.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim }} className="gap-8">
        <View>
          <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-1" style={{ fontFamily: "Inter-Regular" }}>
            Paramètres
          </Text>
          <Text className="text-2xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
            Préférences
          </Text>
        </View>

        <Section title="Notifications">
          <SettingRow
            label="Notifications push"
            description="Recevoir des alertes et mises à jour"
            value={settings.notificationsEnabled}
            onToggle={() => toggle("notificationsEnabled")}
            icon={Bell}
            color={COLORS.warning}
          />
        </Section>

        <Section title="Apparence">
          <SettingRow
            label="Mode sombre"
            description="Activer le thème sombre"
            value={settings.darkTheme}
            onToggle={() => toggle("darkTheme")}
            icon={Moon}
            color={COLORS.accent}
          />
        </Section>

        <Section title="Langue">
          <InfoRow
            label="Langue"
            description={settings.language === "fr" ? "Français" : settings.language === "en" ? "English" : "العربية"}
            icon={Globe}
            color={COLORS.accent}
          />
        </Section>

        <Section title="Confidentialité">
          <InfoRow label="Politique de confidentialité" description="Données personnelles" icon={Lock} color={COLORS.success} />
          <InfoRow label="Conditions d'utilisation" description="Termes et conditions" icon={FileText} color={COLORS.primary} />
        </Section>

        <Section title="Aide">
          <InfoRow label="Aide & Support" description="FAQ, contact, assistance" icon={HelpCircle} color={COLORS.textMuted} />
          <InfoRow label="À propos de WiFi Zone" description="Version 1.0.0" icon={Info} color={COLORS.textSecondary} />
        </Section>

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
