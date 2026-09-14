import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";

import { AuthProvider } from "../contexts/AuthContext";
import { ConnectionProvider } from "../contexts/ConnectionContext";
import { LicenseProvider } from "../contexts/LicenseContext";
import { COLORS } from "../constants/theme";

LogBox.ignoreLogs([
  "new NativeEventEmitter",
  "getDevicePushTokenAsync"
]);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Inter-Regular": Inter_400Regular,
    "Inter-Bold": Inter_700Bold
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} />
      <AuthProvider>
        <LicenseProvider>
          <ConnectionProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
                animation: "fade",
                animationDuration: 300
              }}
            >
              <Stack.Screen name="(public)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen name="license" options={{ headerShown: false }} />
            </Stack>
          </ConnectionProvider>
        </LicenseProvider>
      </AuthProvider>
    </>
  );
}
