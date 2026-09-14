import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Animated, Pressable, Switch, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Globe,
  Info,
  ChevronRight,
  HelpCircle,
  Lock,
  FileText,
  Bell,
  LogOut,
  type LucideIcon
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS, ANIMATION_DURATION } from "../../../constants/theme";
import { getSettings, setSettings } from "../../../services/storage";
import { useAuth } from "../../../contexts/AuthContext";
import StackHeader from "../../../components/StackHeader";
import GlassCard from "../../../components/GlassCard";

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
      <Text style={styles.sectionTitle}>{title}</Text>
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
  icon?: LucideIcon;
  color?: string;
}) {
  return (
    <View className="flex-row items-center gap-4 p-4 rounded-2xl">
      <View style={[styles.rowIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
        {Icon && <Icon color={color || COLORS.accent} size={20} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "rgba(255,255,255,0.25)", true: COLORS.actionBg }}
        thumbColor={value ? COLORS.actionFg : "#FFFFFF"}
      />
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
  icon: LucideIcon;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-4 p-4 rounded-2xl">
      <View style={[styles.rowIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
        <Icon color={color} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
      </View>
      <ChevronRight color={COLORS.textMuted} size={18} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StackHeader title="Paramètres" subtitle="Préférences de l'application" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }} className="gap-8">
          {loading ? (
            <View className="gap-4 mt-3">
              {[1, 2, 3, 4].map((i) => (
                <View key={i} className="h-24 rounded-2xl" style={{ backgroundColor: COLORS.surface }} />
              ))}
            </View>
          ) : (
            <>
              <Section title="Notifications">
                <SettingRow
                  label="Notifications push"
                  description="Recevoir des alertes et mises à jour"
                  value={settings.notificationsEnabled}
                  onToggle={() => toggle("notificationsEnabled")}
                  icon={Bell}
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
                <InfoRow label="Politique de confidentialité" description="Données personnelles" icon={Lock} color={COLORS.accent} />
                <InfoRow label="Conditions d'utilisation" description="Termes et conditions" icon={FileText} color={COLORS.primaryLight} />
              </Section>

              <Section title="Aide">
                <InfoRow label="Aide & Support" description="FAQ, contact, assistance" icon={HelpCircle} color={COLORS.accent} />
                <InfoRow label="À propos de Bôjô" description="Version 1.1.1 • Internet Bôjô pour tous" icon={Info} color={COLORS.textSecondary} />
              </Section>

              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <LogOut color={COLORS.danger} size={20} />
                <Text style={styles.logoutText}>Se déconnecter</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginHorizontal: 4,
    fontFamily: "Inter-Bold"
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  rowTitle: { color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Bold" },
  rowSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, fontFamily: "Inter-Regular" },
  logoutButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  logoutText: { color: COLORS.danger, fontSize: 14, fontFamily: "Inter-Bold" }
});