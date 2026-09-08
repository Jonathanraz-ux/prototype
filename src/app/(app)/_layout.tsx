import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#09090B" }
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="admin" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}
