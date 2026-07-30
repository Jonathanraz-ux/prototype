import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "WiFi Zone",
  slug: "wifi-zone",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./src/assets/images/icon.png",
  scheme: "wifizone",
  userInterfaceStyle: "dark",
  backgroundColor: "#09090B",
  primaryColor: "#2563EB",
  splash: {
    image: "./src/assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#09090B"
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.wifizone.app"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./src/assets/images/adaptive-icon.png",
      backgroundColor: "#09090B"
    },
    package: "com.wifizone.app",
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"],
    jsEngine: "hermes"
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./src/assets/images/favicon.png"
  },
  updates: {
    url: "https://u.expo.dev/2e6a7c75-e194-4d57-b014-49241a807404",
    enabled: true,
    fallbackToCacheTimeout: 0
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  plugins: [
    "expo-router"
  ],
  experiments: {
    typedRoutes: true
  }
};

export default config;
