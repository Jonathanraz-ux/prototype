import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { COLORS } from "../../constants/theme";

export default function PublicLayout() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background }
      }}
    >
      <Stack.Screen name="splash/index" options={{ animation: "fade" }} />
      <Stack.Screen name="welcome/index" options={{ animation: "fade_from_bottom" }} />
      <Stack.Screen name="login/index" />
      <Stack.Screen name="login/forgot-password" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="register/index" />
    </Stack>
  );
}
