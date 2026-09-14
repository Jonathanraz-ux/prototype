import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Search, ArrowUpRight, Globe, Megaphone } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../../../constants/theme";
import { useConnection } from "../../../../contexts/ConnectionContext";
import AppHeader from "../../../../components/AppHeader";

const HOME_URL = "https://www.google.com";

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentAd, adProgress, internetStatus, state } = useConnection();
  const [url, setUrl] = useState(HOME_URL);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  const sessionActive =
    state === "wifi_active" || state === "paused" || internetStatus === "active";

  const go = (target: string) => {
    const normalized =
      /^https?:\/\//i.test(target) || /^about:/.test(target)
        ? target
        : `https://${target}`;
    setUrl(normalized);
    webRef.current?.reload();
  };

  const handleNavigation = (nav: WebViewNavigation) => {
    setUrl(nav.url);
    setLoading(nav.loading);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title="Naviguer" subtitle="Internet Bôjô pour tous" />

        <View style={styles.adBanner}>
          <View style={styles.adPubBadge}>
            <Text style={styles.adPubText}>PUB</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adBannerTitle} numberOfLines={1}>
              {sessionActive && currentAd
                ? `${currentAd.title} — ${currentAd.advertiserName}`
                : "Votre connexion est financée par la publicité"}
            </Text>
            <Text style={styles.adBannerSub} numberOfLines={1}>
              {sessionActive && currentAd
                ? `Publicité en cours — session Internet Bôjô active`
                : "Regardez une publicité pour débloquer l'accès depuis l'Accueil"}
            </Text>
          </View>
          {sessionActive && currentAd && (
            <View style={styles.adProgressWrap}>
              <Text style={styles.adProgressText}>{Math.round((adProgress || 0) * 100)}%</Text>
            </View>
          )}
          <Pressable
            onPress={() => router.push("/(app)/campaigns")}
            accessibilityLabel="Annonces partenaires"
            style={({ pressed }) => [styles.partnersButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Megaphone color={COLORS.actionFg} size={15} />
            <Text style={styles.partnersText}>Partenaires</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.addressRow}>
        <View style={styles.inputWrap}>
          <Globe color={COLORS.textSecondary} size={16} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={() => go(url)}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            accessibilityLabel="Adresse du site"
          />
          {loading && <ActivityIndicator size="small" color={COLORS.actionFg} />}
        </View>
        <Pressable
          onPress={() => go(HOME_URL)}
          hitSlop={6}
          accessibilityLabel="Raccourci Google"
          style={({ pressed }) => [styles.googleButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Search color={COLORS.actionFg} size={18} />
        </Pressable>
        <Pressable
          onPress={() => go(url)}
          hitSlop={6}
          accessibilityLabel="Aller à l'adresse"
          style={({ pressed }) => [styles.goButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ArrowUpRight color={COLORS.actionFg} size={20} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={webRef}
          source={{ uri: url }}
          onNavigationStateChange={handleNavigation}
          startInLoadingState
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  adBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 12
  },
  adPubBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: COLORS.surfaceStrong
  },
  adPubText: { color: COLORS.textPrimary, fontSize: 9, letterSpacing: 1, fontFamily: "Inter-Bold" },
  adBannerTitle: { color: COLORS.textPrimary, fontSize: 13, fontFamily: "Inter-Bold" },
  adBannerSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, fontFamily: "Inter-Regular" },
  adProgressWrap: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.actionBg
  },
  adProgressText: { color: COLORS.actionFg, fontSize: 11, fontFamily: "Inter-Bold" },
  partnersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.actionBg
  },
  partnersText: { color: COLORS.actionFg, fontSize: 10, fontFamily: "Inter-Bold" },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontFamily: "Inter-Regular" },
  googleButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.actionBg
  },
  goButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  webview: { flex: 1, backgroundColor: COLORS.white }
});