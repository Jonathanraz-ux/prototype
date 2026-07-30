import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { COLORS } from "../../constants/theme";

export default function PublicLayout() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#09090B] items-center justify-center">
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#09090B" }
      }}
    >
      <Stack.Screen name="splash" options={{ animation: "fade" }} />
      <Stack.Screen name="welcome" options={{ animation: "fade_from_bottom" }} />
      <Stack.Screen name="login/index" />
      <Stack.Screen name="login/forgot-password" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="register/index" />
      <Stack.Screen name="verify-email" options={{ animation: "fade" }} />
    </Stack>
  );
}
