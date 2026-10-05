import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Home, Compass, type LucideIcon } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import {
  FLOATING_NAV_BUTTON_HEIGHT,
  FLOATING_NAV_BUTTON_MIN_WIDTH,
  FLOATING_NAV_GAP,
  FLOATING_NAV_MARGIN,
  floatingNavWrapHeight,
} from "../lib/floatingNav";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";

export type FloatingNavTarget = "home" | "browse";

export interface FloatingNavProps {
  /** Écran actuellement affiché (état actif mis en évidence). */
  active: FloatingNavTarget;
  /** Navigation vers l'autre écran. */
  onNavigate: (target: FloatingNavTarget) => void;
}

const ITEMS: { target: FloatingNavTarget; label: string; Icon: LucideIcon }[] = [
  { target: "home", label: "Accueil", Icon: Home },
  { target: "browse", label: "Naviguer", Icon: Compass }
];

/**
 * FloatingNav — Les deux seuls boutons de navigation de Bôjô.
 *
 * Supprime la barre d'onglets à quatre entrées au profit de deux boutons
 * flottants compacts (icône + libellé), superposés en bas d'écran :
 *   - sur « Naviguer », ils flottent DANS la zone publicitaire (aucune
 *     bande de navigation séparée, la public conserve sa hauteur) ;
 *   - sur « Accueil », les écrans défilants réservent la hauteur exacte
 *     de ces boutons (voir lib/floatingNav.ts).
 *
 * Lisibilité : chaque bouton a sa propre surface opaque (violet profond ou
 * blanc pour l'actif) doublée d'un voile en dégradé — le contraste est donc
 * assuré quelle que soit la publicité affichée en dessous.
 *
 * Interactions : le conteneur et le voile sont `pointerEvents="none"` /
 * "box-none" — SEULES les surfaces des boutons interceptent le toucher, le
 * reste de la zone publicitaire reste pressable (lecture, pause, gestures).
 * Le conteneur respecte les zones système (barre de navigation Android) et
 * disparaît au clavier ouvert.
 */
export default function FloatingNav({ active, onNavigate }: FloatingNavProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  if (keyboardVisible) return null;

  return (
    <View
      testID="floating-nav"
      style={[styles.wrap, { height: floatingNavWrapHeight(insets.bottom) }]}
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={["rgba(24, 7, 58, 0)", "rgba(24, 7, 58, 0.62)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        testID="floating-nav-row"
        style={[styles.row, { marginBottom: insets.bottom + FLOATING_NAV_MARGIN }]}
        pointerEvents="box-none"
      >
        {ITEMS.map(({ target, label, Icon }) => {
          const focused = target === active;
          return (
            <Pressable
              key={target}
              testID={`floating-nav-${target}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onNavigate(target);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.button,
                focused ? styles.buttonActive : styles.buttonIdle,
                { opacity: pressed ? 0.85 : 1 }
              ]}
            >
              <Icon
                color={focused ? COLORS.actionFg : COLORS.textPrimary}
                size={17}
                strokeWidth={focused ? 2.4 : 2}
              />
              <Text style={[styles.label, focused ? styles.labelActive : styles.labelIdle]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: FLOATING_NAV_GAP
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: FLOATING_NAV_BUTTON_MIN_WIDTH,
    height: FLOATING_NAV_BUTTON_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: FLOATING_NAV_BUTTON_HEIGHT / 2,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8
  },
  buttonIdle: {
    backgroundColor: "rgba(45, 12, 116, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.32)"
  },
  buttonActive: {
    backgroundColor: COLORS.actionBg,
    borderColor: "rgba(255, 255, 255, 0.9)"
  },
  label: { fontSize: 12.5, fontFamily: "Inter-Bold" },
  labelIdle: { color: COLORS.textPrimary },
  labelActive: { color: COLORS.actionFg }
});
