import { Tabs } from "expo-router";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { View, Platform, Pressable } from "react-native";
import { COLORS } from "../../../constants/theme";
import { Home, Clock, Bell, User, Settings } from "lucide-react-native";

const HOME_ICON = Home;
const HOME_ACTIVE = Home;
const CLOCK_ICON = Clock;
const CLOCK_ACTIVE = Clock;
const BELL_ICON = Bell;
const BELL_ACTIVE = Bell;
const USER_ICON = User;
const USER_ACTIVE = User;
const SETTINGS_ICON = Settings;
const SETTINGS_ACTIVE = Settings;

const SPRING_CONFIG = { damping: 15, stiffness: 150, mass: 0.8 };

const TABS = [
  { routeName: "dashboard", label: "Accueil", Icon: HOME_ICON, ActiveIcon: HOME_ACTIVE },
  { routeName: "history", label: "Historique", Icon: CLOCK_ICON, ActiveIcon: CLOCK_ACTIVE },
  { routeName: "notifications", label: "Notifications", Icon: BELL_ICON, ActiveIcon: BELL_ACTIVE },
  { routeName: "profile", label: "Profil", Icon: USER_ICON, ActiveIcon: USER_ACTIVE },
  { routeName: "settings", label: "Réglages", Icon: SETTINGS_ICON, ActiveIcon: SETTINGS_ACTIVE }
] as const;

function AnimatedTabIcon({
  Icon,
  ActiveIcon,
  focused
}: {
  Icon: React.ComponentType<{ color: string; size: number }>;
  ActiveIcon: React.ComponentType<{ color: string; size: number }>;
  focused: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(focused ? 1.15 : 1, SPRING_CONFIG) },
      { translateY: withSpring(focused ? -4 : 0, SPRING_CONFIG) }
    ],
    opacity: withTiming(focused ? 1 : 0.7, { duration: 200 })
  }));

  const IconComponent = focused ? ActiveIcon : Icon;

  return (
    <Animated.View style={animatedStyle}>
      <IconComponent color={focused ? COLORS.accent : COLORS.textSecondary} size={24} />
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      initialLayout={{ width: 100, height: 100 }}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "rgba(9, 9, 11, 0.92)",
          borderTopColor: "rgba(255, 255, 255, 0.06)",
          borderTopWidth: 1,
          height: 88,
          paddingBottom: Platform.OS === "ios" ? 32 : 18,
          paddingTop: 10,
          elevation: 0
        },
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { flex: 1 }
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.routeName}
          name={tab.routeName}
          options={{
            tabBarLabel: ({ focused }) => <Label text={tab.label} focused={focused} />,
            tabBarIcon: ({ focused }) => (
              <AnimatedTabIcon
                Icon={tab.Icon}
                ActiveIcon={tab.ActiveIcon}
                focused={focused}
              />
            )
          }}
        />
      ))}
    </Tabs>
  );
}

function Label({ text, focused }: { text: string; focused: boolean }) {
  return (
    <Animated.Text
      style={[
        {
          fontSize: 11,
          fontWeight: "700",
          color: focused ? COLORS.accent : COLORS.textSecondary,
          letterSpacing: 0.3,
          marginTop: 3
        }
      ]}
    >
      {text}
    </Animated.Text>
  );
}
