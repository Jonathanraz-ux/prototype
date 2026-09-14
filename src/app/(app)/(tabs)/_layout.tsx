import { Tabs } from "expo-router";
import { View, Platform, Text, StyleSheet, Pressable } from "react-native";
import Animated, { useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../../constants/theme";
import {
  Home,
  Compass,
  History,
  User,
  type LucideIcon
} from "lucide-react-native";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";

const SPRING = { damping: 16, stiffness: 180, mass: 0.6 };

type TabDef = {
  routeName: string;
  label: string;
  Icon: LucideIcon;
};

// Le fichier de chaque onglet vit dans un sous-dossier (dashboard/index.tsx),
// donc la route réelle EST "dashboard/index". Le name des Tabs.Screen DOIT
// correspondre exactement au chemin du fichier, sinon Expo Router régénère
// des onglets par défaut (sans icône, label = nom de route).
const TABS: TabDef[] = [
  { routeName: "dashboard/index", label: "Accueil", Icon: Home },
  { routeName: "browse/index", label: "Naviguer", Icon: Compass },
  { routeName: "history/index", label: "Historique", Icon: History },
  { routeName: "profile/index", label: "Profil", Icon: User }
];

function HapticTabButton(props: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        props.onPress?.(e);
      }}
      style={{ flex: 1 }}
    >
      {props.children}
    </Pressable>
  );
}

function TabIcon({ Icon, focused }: { Icon: LucideIcon; focused: boolean }) {
  const pillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 180 }),
    transform: [{ scale: withSpring(focused ? 1 : 0.5, SPRING) }]
  }));

  return (
    <View style={styles.iconSlot}>
      <Animated.View style={[styles.pill, pillStyle]} />
      <Icon
        color={focused ? COLORS.actionFg : COLORS.textSecondary}
        size={22}
        strokeWidth={focused ? 2.4 : 2}
      />
    </View>
  );
}

function Label({ text, focused }: { text: string; focused: boolean }) {
  return (
    <Text
      style={[styles.label, { color: focused ? COLORS.textPrimary : COLORS.textMuted }]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.routeName}
          name={tab.routeName}
          options={{
            tabBarLabel: ({ focused }) => <Label text={tab.label} focused={focused} />,
            tabBarIcon: ({ focused }) => <TabIcon Icon={tab.Icon} focused={focused} />,
            tabBarButton: HapticTabButton
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: Platform.OS === "ios" ? 22 : 16,
    height: Platform.OS === "ios" ? 76 : 70,
    backgroundColor: "rgba(58, 9, 150, 0.96)",
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 26,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 12 : 8,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 28
  },
  tabItem: {
    flex: 1,
    paddingHorizontal: 4
  },
  iconSlot: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  pill: {
    position: "absolute",
    width: 48,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)"
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    fontFamily: "Inter-Bold",
    marginTop: 3,
    textAlign: "center"
  }
});