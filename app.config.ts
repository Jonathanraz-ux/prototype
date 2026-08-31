import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "WiFi Zone",
  slug: "wifi-zone",
  version: "1.1.0",
  orientation: "portrait",
  icon: "./src/assets/images/icon.png",
  scheme: "wifizone",
  userInterfaceStyle: "dark",
  backgroundColor: "#09090B",
  primaryColor: "#F97316",
  splash: {
    image: "./src/assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#09090B"
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.wifizone.app",
    buildNumber: "2"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./src/assets/images/adaptive-icon.png",
      backgroundColor: "#09090B"
    },
    package: "com.wifizone.app",
    versionCode: 2,
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"],
    jsEngine: "hermes"
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./src/assets/images/favicon.png"
  },
  updates: {
    url: "https://u.expo.dev/5caa1c7d-66c3-492e-9d44-6ef6661b9902",
    enabled: true,
    fallbackToCacheTimeout: 0
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  extra: {
    eas: {
      projectId: "5caa1c7d-66c3-492e-9d44-6ef6661b9902"
    }
  },
  plugins: [
    "expo-router"
  ],
  experiments: {
    typedRoutes: true
  }
};

export default config;
