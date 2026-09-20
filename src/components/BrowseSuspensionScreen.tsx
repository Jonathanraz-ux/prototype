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
} from "lucide-react-native";
import { COLORS, RADIUS } from "../constants/theme";
import {
  browseSuspensionText,
  type BrowseGateReason,
} from "../lib/browsePolicy";

const REASON_ICON: Record<BrowseGateReason, React.ReactNode> = {
  no_session: <Play color={COLORS.textPrimary} size={26} fill={COLORS.textPrimary} />,
  preparing_ad: <LoaderCircle color={COLORS.accentSoft} size={26} />,
  authorizing: <Clock color={COLORS.accentSoft} size={26} />,
  verifying: <LoaderCircle color={COLORS.accentSoft} size={26} />,
  paused: <PauseCircle color={COLORS.accentSoft} size={26} />,
  quota_exhausted: <HardDrive color={COLORS.warning} size={26} />,
  error: <AlertTriangle color={COLORS.warning} size={26} />,
  disconnecting: <Power color={COLORS.accentSoft} size={26} />,
  offline: <WifiOff color={COLORS.warning} size={26} />,
  cellular: <Smartphone color={COLORS.warning} size={26} />,
};

interface BrowseSuspensionScreenProps {
  reason: BrowseGateReason;
  onGoHome: () => void;
}

/**
 * Écran de suspension de la navigation Bôjô.
 *
 * Affiché À LA PLACE de la WebView quand les conditions de session et
 * d'affichage publicitaire ne sont pas satisfaites. Le contenu web n'est
 * jamais rendu sur cet écran : la WebView est démontée (arrêt des
 * chargements, des médias et des nouveaux accès). Thème Bôjô : fond
 * violet, textes blancs.
 */
export default function BrowseSuspensionScreen({
  reason,
  onGoHome,
}: BrowseSuspensionScreenProps) {
  const text = browseSuspensionText(reason);
  return (
    <View style={styles.frame}>
      <View style={styles.inner}>
        <View style={styles.iconWrap}>{REASON_ICON[reason]}</View>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.message}>{text.message}</Text>
        <Pressable
          onPress={onGoHome}
          accessibilityLabel="Aller à l'Accueil"
          style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.ctaText}>Aller à l'Accueil</Text>
        </Pressable>
        <Text style={styles.footnote}>
          Internet Bôjô pour tous · La navigation reprend dès que la publicité
          et la session sont actives.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  inner: { alignItems: "center", width: "100%" },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    marginBottom: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter-Regular",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 280,
  },
  cta: {
    marginTop: 20,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.actionBg,
  },
  ctaText: { color: COLORS.actionFg, fontSize: 13.5, fontFamily: "Inter-Bold" },
  footnote: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontFamily: "Inter-Regular",
    textAlign: "center",
    marginTop: 22,
    maxWidth: 260,
  },
});