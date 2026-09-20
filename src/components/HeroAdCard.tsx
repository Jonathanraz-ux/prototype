import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Megaphone,
  Zap,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  type LucideIcon,
} from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { useConnection } from "../contexts/ConnectionContext";
import { useIsFocusedScreen } from "../hooks/useIsFocusedScreen";
import AdMedia from "./AdMedia";

const AD_ICONS: Record<string, LucideIcon> = {
  NordVPN: ShieldCheck,
  "Partenaire Démo": Zap,
};

/**
 * HeroAdCard — Lecteur publicitaire interactif.
 *
 * Utilise les événements réels du lecteur expo-av (chargement, lecture, pause, fin, erreur).
 * En écran partagé :
 * - Lecture active (isPlaying = true) -> autorisation VPN activée (Chrome charge)
 * - Pause (isPlaying = false) -> blocage VPN immédiat (Chrome bloqué)
 * - Reprise -> autorisation VPN réactivée
 * - Fin -> validation de session et quota décompté
 */
export default function HeroAdCard() {
  const {
    currentAd,
    state,
    adProgress,
    adIsPlaying,
    adBuffering,
    lastError,
    connect,
    pauseSession,
    internetStatus,
    vpnStatus,
    handlePlaybackStatusUpdate,
    handleAdMediaError,
  } = useConnection();

  const [mediaFailed, setMediaFailed] = useState(false);
  const [isPlayingRequested, setIsPlayingRequested] = useState(true);

  // Les onglets restent montés : un SEUL lecteur actif à la fois (l'onglet
  // masqué met sa vidéo en pause et cesse d'émettre ses événements), pour
  // éviter deux audios/vidéos et deux comptages simultanés.
  const isFocused = useIsFocusedScreen();

  const isWatching = state === "ad_active" || state === "ad_loading";
  const completed = state === "wifi_active" || state === "authorizing_wifi";
  const isConnected = state === "wifi_active";
  // La publicité reste à l'écran (visible + en lecture) tant qu'on regarde
  // OU qu'une session démo validée la maintient à l'écran.
  const adOnScreen = isWatching || (completed && Boolean(currentAd));

  // Mode boucle actif dès que la session démo est autorisée (connectée OU
  // en pause volontaire). Stable durant pause/reprise : la boucle ne démarre
  // donc qu'à la validation de la première lecture, jamais à chaque reprise.
  const loopMode = state === "wifi_active" || state === "paused";

  // Réinitialiser les erreurs média et la demande de lecture quand une nouvelle pub arrive.
  useEffect(() => {
    setMediaFailed(false);
    if (state === "ad_active") {
      setIsPlayingRequested(true);
    }
  }, [currentAd?.id, state]);

  // Transfert de focus (Naviguer → Accueil) pendant une session autorisée ou
  // un visionnage : la publicité reprend d'elle-même, elle n'est jamais
  // laissée figée après une reprise centrale. La pause volontaire sur
  // l'onglet courant (state "paused") n'est pas concernée.
  useEffect(() => {
    if (isFocused && (state === "wifi_active" || state === "ad_active")) {
      setIsPlayingRequested(true);
    }
  }, [isFocused, state]);

  // Si aucune pub disponible et aucune lecture en cours :
  if (!currentAd && !isWatching && !completed) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <LinearGradient
          colors={["#1A1012", "#3A1216"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.emptyIcon}>
          {lastError ? (
            <AlertTriangle color={COLORS.warning} size={28} />
          ) : (
            <Megaphone color={COLORS.danger} size={26} />
          )}
        </View>
        <Text style={styles.warnTitle}>
          {lastError ? "Rapport d'erreur connexion" : "Aucune publicité disponible"}
        </Text>
        <Text style={styles.warnDesc}>
          {lastError ?? "Aucune campagne active pour le moment. La connexion reste interrompue."}
        </Text>
        <Pressable onPress={connect} style={styles.retryButton}>
          <RefreshCw color="#FFFFFF" size={16} />
          <Text style={styles.retryText}>Vérifier à nouveau</Text>
        </Pressable>
      </View>
    );
  }

  // Écran après complétion
  if (!currentAd && (isWatching || completed)) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <LinearGradient
          colors={["#0B3B1F", "#0E5A2E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.emptyIcon}>
          <Sparkles color={COLORS.success} size={26} />
        </View>
        <Text style={styles.warnTitle}>Publicité validée</Text>
        <Text style={styles.warnDesc}>
          Votre connexion a été autorisée. Le trafic Internet est débloqué.
        </Text>
      </View>
    );
  }

  if (!currentAd) {
    return (
      <Pressable onPress={connect} style={styles.loadingButton}>
        <Text style={styles.loadingText}>Regarder la pub et se connecter</Text>
      </Pressable>
    );
  }

  const gradient: [string, string] = currentAd.gradient
    ? [currentAd.gradient[0], currentAd.gradient[1]]
    : [currentAd.background, currentAd.accentColor];
  const BrandIcon = AD_ICONS[currentAd.advertiserName] ?? Zap;
  const progressPercent = Math.round((adProgress || 0) * 100);

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

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {mediaFailed ? (
          <View style={styles.mediaFallback}>
            <BrandIcon color="#FFFFFF" size={44} />
          </View>
        ) : (
          <AdMedia
            key={currentAd.id}
            ad={currentAd}
            shouldPlay={adOnScreen && isPlayingRequested && isFocused}
            isLooping={loopMode}
            onError={() => {
              setMediaFailed(true);
              if (isFocused) {
                void handleAdMediaError("Échec de lecture du média publicitaire");
              }
            }}
            onPlaybackStatusUpdate={(status) => {
              if (isFocused) {
                void handlePlaybackStatusUpdate(status);
              }
            }}
          />
        )}

        {adBuffering && (
          <View style={styles.bufferOverlay}>
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}

        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.65)"]}
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
            {adOnScreen && (
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        vpnStatus?.state === "ALLOWED" && internetStatus === "active"
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(245, 158, 11, 0.3)",
                    },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {vpnStatus?.state === "ALLOWED" && internetStatus === "active"
                      ? "Accès autorisé"
                      : "Accès suspendu"}
                  </Text>
                </View>
                {state === "wifi_active" && (
                  <View style={[styles.statusBadge, { backgroundColor: "rgba(99, 102, 241, 0.3)" }]}>
                    <Text style={styles.statusBadgeText}>
                      {adIsPlaying ? "Lecture active" : "Lecture en pause"}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <Pressable onPress={togglePlayback} style={styles.creative}>
            <View style={styles.centerControlWrap}>
              <View style={styles.creativeIcon}>
                <BrandIcon color="#FFFFFF" size={28} strokeWidth={1.8} />
              </View>
              {adOnScreen && (
                <View style={styles.playPauseOverlay}>
                  {adIsPlaying ? (
                    <Pause color="#FFFFFF" size={28} />
                  ) : (
                    <Play color="#FFFFFF" size={28} fill="#FFFFFF" />
                  )}
                </View>
              )}
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {currentAd.title}
            </Text>
            {currentAd.advertiserName && (
              <Text style={styles.brand}>{currentAd.advertiserName}</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <View style={styles.fundingRow}>
              <Sparkles color="#FFFFFF" size={13} />
              <Text style={styles.fundingText}>
                {adOnScreen
                  ? adIsPlaying
                    ? "Lecture en cours — Appuyez pour mettre en pause"
                    : "En pause — Appuyez pour reprendre la lecture"
                  : "Appuyez sur « Regarder » pour débloquer la connexion"}
              </Text>
            </View>

            {adOnScreen ? (
              <>
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.timerText}>
                  {Math.max(0, Math.ceil(currentAd.durationSeconds * (1 - (adProgress || 0))))} s restantes
                </Text>
              </>
            ) : (
              <Pressable onPress={connect} style={styles.startAdButton}>
                <Play color={COLORS.actionFg} size={16} fill={COLORS.actionFg} />
                <Text style={styles.startAdText}>Regarder la pub et se connecter</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 250 },
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
    elevation: 18,
  },
  emptyCard: { paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    marginBottom: 14,
  },
  warnTitle: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter-Bold", textAlign: "center" },
  warnDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 14,
    fontFamily: "Inter-Regular",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter-Bold" },
  mediaFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  content: { flex: 1, padding: 16, justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  pubText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "Inter-Bold",
  },
  advertiserChip: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  advertiserText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontFamily: "Inter-Regular",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontFamily: "Inter-Bold",
  },
  creative: { flex: 1, justifyContent: "center", paddingHorizontal: 4, paddingVertical: 8 },
  centerControlWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  creativeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  playPauseOverlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  title: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontFamily: "Inter-Bold" },
  brand: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 3,
    fontFamily: "Inter-Regular",
  },
  footer: { marginTop: 8 },
  fundingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  fundingText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Inter-Regular",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: 3, backgroundColor: "#FFFFFF" },
  timerText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11.5,
    fontFamily: "Inter-Bold",
    marginTop: 4,
    textAlign: "center",
  },
  startAdButton: {
    height: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.actionBg,
    marginTop: 4,
  },
  startAdText: { color: COLORS.actionFg, fontSize: 14, fontFamily: "Inter-Bold" },
  loadingButton: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.actionBg,
  },
  loadingText: { color: COLORS.actionFg, fontSize: 15.5, fontFamily: "Inter-Bold" },
});
