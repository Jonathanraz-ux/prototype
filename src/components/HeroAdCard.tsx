import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import { Megaphone, Zap, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { useConnection } from "../contexts/ConnectionContext";

const AD_ICONS: Record<string, LucideIcon> = {
  NordVPN: ShieldCheck,
};

/**
 * HeroAdCard — Lecteur publicitaire obligatoire.
 *
 * La publicité doit être regardée jusqu'au bout. Le bouton de fermeture
 * n'existe PAS pendant la lecture : il n'apparaît qu'après complétion.
 * La récompense n'est jamais accordée par le téléphone, uniquement par
 * la Edge Function complete-ad-view (voir ConnectionContext.finalizeAdView).
 */
export default function HeroAdCard() {
  const { currentAd, state, adProgress, connect, internetStatus } = useConnection();
  const [mediaFailed, setMediaFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const isWatching = state === "ad_found" || state === "connecting";
  const completed = state === "connected" && !currentAd;

  // Réinitialiser les erreurs média quand une nouvelle pub arrive.
  useEffect(() => {
    setMediaFailed(false);
    setBuffering(false);
  }, [currentAd?.id]);

  // Publiques : si aucune pub en cours, afficher un état "aucune pub disponible".
  if (!currentAd && !isWatching && !completed) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <LinearGradient colors={["#1A1012", "#3A1216"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.emptyIcon}>
          <Megaphone color={COLORS.danger} size={26} />
        </View>
        <Text style={styles.warnTitle}>Aucune publicité disponible</Text>
        <Text style={styles.warnDesc}>
          Aucune campagne active pour le moment. La connexion reste interrompue.
        </Text>
        {internetStatus !== "active" && (
          <Text style={styles.emptyHint}>Contactez votre gestionnaire de site.</Text>
        )}
      </View>
    );
  }

  if (!currentAd && (isWatching || completed)) {
    // Transition après complétion
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <LinearGradient colors={["#0B3B1F", "#0E5A2E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.emptyIcon}>
          <Sparkles color={COLORS.success} size={26} />
        </View>
        <Text style={styles.warnTitle}>Publicité terminée</Text>
        <Text style={styles.warnDesc}>
          Votre connexion a été financée. Vous êtes en ligne.
        </Text>
      </View>
    );
  }

  if (!currentAd) {
    return (
      <PressableLoading onPress={connect} />
    );
  }

  const gradient: [string, string] = currentAd.gradient
    ? [currentAd.gradient[0], currentAd.gradient[1]]
    : [currentAd.background, currentAd.accentColor];
  const BrandIcon = AD_ICONS[currentAd.advertiserName] ?? Zap;
  const progressPercent = Math.round((adProgress || 0) * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

        {mediaFailed ? (
          <View style={styles.mediaFallback}>
            <BrandIcon color="#FFFFFF" size={44} />
          </View>
        ) : (
          <AdMedia
            key={currentAd.id}
            ad={currentAd}
            onError={() => setMediaFailed(true)}
            onBuffer={() => setBuffering(true)}
            onReady={() => setBuffering(false)}
          />
        )}

        {buffering && (
          <View style={styles.bufferOverlay}>
            <ActivityIndicator color="#FFFFFF" size="large" />
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
              <Megaphone color="#FFFFFF" size={11} strokeWidth={2.5} />
              <Text style={styles.pubText}>PUB</Text>
            </View>
            <View style={styles.advertiserChip}>
              <Text style={styles.advertiserText} numberOfLines={1}>
                {currentAd.advertiserName}
              </Text>
            </View>
          </View>

          <View style={styles.creative}>
            <View style={styles.creativeIcon}>
              <BrandIcon color="#FFFFFF" size={30} strokeWidth={1.8} />
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {currentAd.title}
            </Text>
            {currentAd.advertiserName && (
              <Text style={styles.brand}>{currentAd.advertiserName}</Text>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.fundingRow}>
              <Sparkles color="#FFD166" size={13} />
              <Text style={styles.fundingText}>
                {isWatching
                  ? "Regardez toute la publicité pour vous connecter"
                  : "Cette publicité a financé votre connexion"}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progressPercent}%` }]} />
            </View>
            {isWatching && (
              <Text style={styles.timerText}>
                {Math.max(0, Math.ceil((currentAd.durationSeconds * (1 - (adProgress || 0)))))}
                {" s"}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function PressableLoading({ onPress }: { onPress: () => Promise<void> }) {
  return (
    <Pressable onPress={onPress} style={styles.loadingButton}>
      <Text style={styles.loadingText}>Regarder la pub et se connecter</Text>
    </Pressable>
  );
}

function AdMedia({
  ad,
  onError,
  onBuffer,
  onReady,
}: {
  ad: { type: "image" | "video"; mediaUrl: string };
  onError: () => void;
  onBuffer: () => void;
  onReady: () => void;
}) {
  if (ad.type === "video") {
    return (
      <Video
        source={{ uri: ad.mediaUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
        useNativeControls={false}
        onError={onError}
        onLoadStart={onBuffer}
        onLoad={onReady}
      />
    );
  }
  return (
    <Image
      source={{ uri: ad.mediaUrl }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 240 },
  card: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 18
  },
  emptyCard: { paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    marginBottom: 18
  },
  warnTitle: { color: "#FFFFFF", fontSize: 20, fontFamily: "Inter-Bold" },
  warnDesc: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
    fontFamily: "Inter-Regular"
  },
  emptyHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 12,
    fontFamily: "Inter-Regular"
  },
  mediaFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)"
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)"
  },
  content: { flex: 1, padding: 18 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  pubText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "Inter-Bold"
  },
  advertiserChip: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.22)"
  },
  advertiserText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontFamily: "Inter-Regular"
  },
  creative: { flex: 1, justifyContent: "center", paddingHorizontal: 6 },
  creativeIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: 16
  },
  title: { color: "#FFFFFF", fontSize: 26, lineHeight: 32, fontFamily: "Inter-Bold" },
  brand: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
    fontFamily: "Inter-Regular"
  },
  footer: { marginTop: 14 },
  fundingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 9 },
  fundingText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Inter-Regular"
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden"
  },
  trackFill: { height: "100%", borderRadius: 3, backgroundColor: "#FFD166" },
  timerText: {
    color: "#FFD166",
    fontSize: 12,
    fontFamily: "Inter-Bold",
    marginTop: 6,
    textAlign: "center"
  },
  loadingButton: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary
  },
  loadingText: { color: "#FFFFFF", fontSize: 15.5, fontFamily: "Inter-Bold" }
});
