import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Bôjô",
  slug: "wifi-zone",
  version: "1.1.1",
  orientation: "portrait",
  icon: "./src/assets/images/bojo-icon-square.png",
  scheme: "bojo",
  userInterfaceStyle: "dark",
  backgroundColor: "#5913f5",
  primaryColor: "#5913f5",
  splash: {
    image: "./src/assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#5913f5"
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.bojo.app",
    buildNumber: "2"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./src/assets/images/bojo-icon-square.png",
      backgroundColor: "#5913f5"
    },
    // Identifiant conservé volontairement : tous les builds EAS existants et
    // l'APK installé sur le poste de test sont en com.wifizone.app. Changer
    // ce nom FERME la mise à jour en place (signature identique obligatoire
    // sur un package inchangé) → préserver à moins de conflit démontré.
    package: "com.wifizone.app",
    versionCode: 3,
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
    "expo-router",
    [
      "expo-notifications",
      {
        icon: "./src/assets/images/bojo-icon-square.png",
        color: "#5913f5",
        defaultChannel: "default",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./src/assets/images/splash.png",
        imageWidth: 260,
        resizeMode: "contain",
        backgroundColor: "#5913f5",
      },
    ],
    "./plugins/withVpnBlocker",
  ],
  experiments: {
    typedRoutes: true
  }
};

export default config;