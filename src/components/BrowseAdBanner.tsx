import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Megaphone, Sparkles, AlertTriangle, Play, Pause, Info } from "lucide-react-native";
import { COLORS, RADIUS } from "../constants/theme";
import { useConnection } from "../contexts/ConnectionContext";
import AdMedia from "./AdMedia";

/**
 * BrowseAdBanner — Publicité persistante du navigateur.
 *
 * Composant natif placé DANS la structure de l'écran (hors WebView, hors
 * contenu défilant) : il reste visible pendant la navigation, le défilement
 * et les chargements. Réutilise le lecteur média et les gestionnaires du
 * mécanisme central de connexion (aucune injection dans les pages tierces,
 * aucune nouvelle source de vérité de visibilité).
 *
 * Pendant une session active, le média tourne en boucle : le mécanisme
 * central re-contrôle la session par heartbeat ; si l'affichage ne peut pas
 * être conservé, l'arrière-plan provoque déjà la suspension centrale
 * (ConnectionContext → paused + blocage vpn).
 */
export default function BrowseAdBanner() {
  const router = useRouter();
  const {
    currentAd,
    state,
    adProgress,
    adIsPlaying,
    adBuffering,
    connect,
    pauseSession,
    handlePlaybackStatusUpdate,
    handleAdMediaError,
  } = useConnection();

  const [mediaFailed, setMediaFailed] = useState(false);
  const [isPlayingRequested, setIsPlayingRequested] = useState(true);

  const isWatching = state === "ad_active" || state === "ad_loading";
  const isConnected = state === "wifi_active";
  // Identique à l'Accueil : la pub n'est "à l'écran" que lors du visionnage
  // OU d'une session validée. La pause volontaire coupe le média et affiche
  // un rappel d'action (comportement central conservé).
  const completed = isConnected || state === "authorizing_wifi";
  const adOnScreen = isWatching || (completed && Boolean(currentAd));
  const loopMode = state === "wifi_active" || state === "paused";

  useEffect(() => {
    setMediaFailed(false);
    if (state === "ad_active") {
      setIsPlayingRequested(true);
    }
  }, [currentAd?.id, state]);

  const togglePlayback = () => {
    if (isWatching) {
      setIsPlayingRequested((prev) => !prev);
      return;
    }
    if (isConnected) {
      if (adIsPlaying) {
        setIsPlayingRequested(false);
        void pauseSession();
      } else {
        setIsPlayingRequested(true);
        void connect();
      }
      return;
    }
    void connect();
  };

  const progressPercent = Math.round((adProgress || 0) * 100);

  if (!currentAd) {
    return (
      <View style={[styles.banner, styles.hintBanner]}>
        <View style={styles.pubBadge}>
          <Megaphone color={COLORS.white} size={11} strokeWidth={2.5} />
          <Text style={styles.pubText}>PUB</Text>
        </View>
        <Sparkles color={COLORS.accentSoft} size={14} />
        <View style={{ flex: 1 }}>
          <Text style={styles.hintTitle}>Votre connexion est financée par la publicité</Text>
          <Text style={styles.hintSub}>
            Regardez une publicité depuis l'Accueil pour débloquer l'accès
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(app)/campaigns")}
          hitSlop={6}
          accessibilityLabel="Annonces partenaires"
          style={({ pressed }) => [styles.partnersButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Info color={COLORS.actionFg} size={13} />
          <Text style={styles.partnersText}>Partenaires</Text>
        </Pressable>
      </View>
    );
  }

  const gradient: [string, string] =
    currentAd.gradient && currentAd.gradient.length >= 2
      ? [currentAd.gradient[0], currentAd.gradient[1]]
      : [currentAd.background, currentAd.accentColor];

  return (
    <Pressable
      onPress={togglePlayback}
      accessibilityLabel={adOnScreen ? "Publicité — contrôler la lecture" : "Publicité — regarder et se connecter"}
      style={({ pressed }) => [styles.banner, { opacity: pressed ? 0.94 : 1 }]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {!mediaFailed ? (
        <AdMedia
          ad={currentAd}
          shouldPlay={adOnScreen && isPlayingRequested}
          isLooping={loopMode}
          onError={() => {
            setMediaFailed(true);
            void handleAdMediaError("Échec de lecture du média publicitaire");
          }}
          onPlaybackStatusUpdate={(status) => {
            void handlePlaybackStatusUpdate(status);
          }}
        />
      ) : (
        <View style={styles.mediaFallback}>
          <AlertTriangle color={COLORS.white} size={20} />
        </View>
      )}

      {adBuffering && (
        <View style={styles.bufferOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.white} size="small" />
        </View>
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.6)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.pubBadge}>
            <Megaphone color={COLORS.white} size={11} strokeWidth={2.5} />
            <Text style={styles.pubText}>PUB</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {currentAd.title}
          </Text>
          {adOnScreen && (
            <View style={styles.playChip}>
              {adIsPlaying ? (
                <Pause color={COLORS.white} size={12} />
              ) : (
                <Play color={COLORS.white} size={12} fill={COLORS.white} />
              )}
              <Text style={styles.playChipText}>{progressPercent}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.brand} numberOfLines={1}>
          {currentAd.advertiserName}
        </Text>
        <Text style={styles.stateLine} numberOfLines={1}>
          {isConnected
            ? adIsPlaying
              ? "Lecture en cours — session Internet active"
              : "En pause — appuyez pour reprendre"
            : isWatching
              ? "Lecture de la publicité…"
              : "Appuyez pour regarder la pub et se connecter"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 96,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 20,
  },
  hintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  pubText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "Inter-Bold",
  },
  hintTitle: { color: COLORS.textPrimary, fontSize: 12, fontFamily: "Inter-Bold" },
  hintSub: { color: COLORS.textSecondary, fontSize: 10.5, marginTop: 2, fontFamily: "Inter-Regular" },
  partnersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.actionBg,
  },
  partnersText: { color: COLORS.actionFg, fontSize: 9.5, fontFamily: "Inter-Bold" },
  mediaFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  content: { flex: 1, padding: 12, justifyContent: "flex-end" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: COLORS.white, fontSize: 13, fontFamily: "Inter-Bold" },
  playChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  playChipText: { color: COLORS.white, fontSize: 10.5, fontFamily: "Inter-Bold" },
  brand: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2, fontFamily: "Inter-Regular" },
  stateLine: { color: "rgba(255,255,255,0.92)", fontSize: 10.5, marginTop: 4, fontFamily: "Inter-Regular" },
});