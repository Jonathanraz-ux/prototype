import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  Play,
  Clock,
  PauseCircle,
  HardDrive,
  AlertTriangle,
  Power,
  WifiOff,
  Smartphone,
  LoaderCircle,
  RefreshCw,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS, RADIUS } from "../constants/theme";
import {
  browseSuspensionText,
  type BrowseGateReason,
} from "../lib/browsePolicy";

const REASON_ICON: Record<BrowseGateReason, React.ReactNode> = {
  no_session: <Play color={COLORS.textPrimary} size={24} fill={COLORS.textPrimary} />,
  preparing_ad: <LoaderCircle color={COLORS.accentSoft} size={24} />,
  authorizing: <Clock color={COLORS.accentSoft} size={24} />,
  verifying: <LoaderCircle color={COLORS.accentSoft} size={24} />,
  paused: <PauseCircle color={COLORS.accentSoft} size={24} />,
  quota_exhausted: <HardDrive color={COLORS.warning} size={24} />,
  error: <AlertTriangle color={COLORS.warning} size={24} />,
  disconnecting: <Power color={COLORS.accentSoft} size={24} />,
  offline: <WifiOff color={COLORS.warning} size={24} />,
  cellular: <Smartphone color={COLORS.warning} size={24} />,
};

interface BrowseSuspensionOverlayProps {
  reason: BrowseGateReason;
  onRetry?: () => void;
}

/**
 * Voile semi-transparent AU-DESSUS de la page encore montée, utilisé pendant
 * les suspensions COURTES (vérification, autorisation, pause, préparation de
 * la publicité). La page déjà chargée reste montée et gelée (navigation
 * bloquée, chargements et médias arrêtés par l'écran), l'URL et l'historique
 * sont conservés : on ne détruit jamais une page pour une transition fugitive.
 */
export default function BrowseSuspensionOverlay({
  reason,
  onRetry,
}: BrowseSuspensionOverlayProps) {
  const router = useRouter();
  const text = browseSuspensionText(reason);
  return (
    <View style={styles.frame} pointerEvents="auto">
      <View style={styles.inner}>
        <View style={styles.iconWrap}>{REASON_ICON[reason]}</View>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.message}>{text.message}</Text>
        <View style={styles.actions}>
          {onRetry && (
            <Pressable
              onPress={onRetry}
              accessibilityLabel="Vérifier à nouveau"
              style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.85 : 1 }]}
            >
              <RefreshCw color={COLORS.actionFg} size={15} />
              <Text style={styles.retryText}>Vérifier à nouveau</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/(app)/(tabs)/dashboard")}
            accessibilityLabel="Aller à l'Accueil"
            style={({ pressed }) => [styles.home, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.homeText}>Aller à l'Accueil</Text>
          </Pressable>
        </View>
        <Text style={styles.footnote}>
          La page reste en attente : l'accès reprend dès confirmation.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
    backgroundColor: "rgba(11, 18, 32, 0.78)",
    borderRadius: RADIUS.lg,
  },
  inner: { alignItems: "center", width: "100%" },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    marginBottom: 14,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: "Inter-Regular",
    textAlign: "center",
    marginTop: 6,
    maxWidth: 280,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.actionBg,
  },
  retryText: { color: COLORS.actionFg, fontSize: 12.5, fontFamily: "Inter-Bold" },
  home: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  homeText: { color: COLORS.textPrimary, fontSize: 12.5, fontFamily: "Inter-Bold" },
  footnote: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontFamily: "Inter-Regular",
    textAlign: "center",
    marginTop: 16,
    maxWidth: 260,
  },
});