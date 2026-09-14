import { Stack } from "expo-router";
import { COLORS } from "../../constants/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background }
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="notifications/index" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="settings/index" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="campaigns/index" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="dev/index" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="admin" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}