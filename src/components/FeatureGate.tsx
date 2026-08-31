import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Lock } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { useLicense } from "../contexts/LicenseContext";
import {
  FEATURE_CATALOG,
  LOCKED_FEATURE_MESSAGE,
  type LicenseFeatures,
} from "../lib/features/licenseFeatures";

interface FeatureGateProps {
  feature: LicenseFeatures;
  children: React.ReactNode;
  /** Lorsque true, affiche le contenu verrouillé sous l'enfant (optionnel). */
  lockedChildren?: React.ReactNode;
}

/**
 * FeatureGate — Verrouille une fonctionnalité en fonction des features
 * autorisées par la licence serveur. Affiche une formulation
 * professionnelle quand la fonction n'est pas incluse dans le plan.
 *
 * Ne disperse aucun booléen codé en dur dans l'application : tout est
 * centralisé via la propriété `feature` et le catalogue FEATURE_CATALOG.
 */
export default function FeatureGate({ feature, children, lockedChildren }: FeatureGateProps) {
  const { gate } = useLicense();
  const enabledFeatures: string[] = gate.details?.features ?? [];

  const isEnabled = enabledFeatures.includes(feature);

  if (isEnabled) {
    return <>{children}</>;
  }

  const meta = FEATURE_CATALOG[feature];

  return (
    <View style={styles.container}>
      {lockedChildren}
      <View style={styles.lockRow}>
        <View style={styles.lockIcon}>
          <Lock color={COLORS.textMuted} size={16} />
        </View>
        <View style={styles.lockTextWrap}>
          <Text style={styles.lockTitle}>{meta?.title ?? "Fonctionnalité"}</Text>
          <Text style={styles.lockMessage}>{LOCKED_FEATURE_MESSAGE}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: "hidden",
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "rgba(24, 24, 27, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(113, 113, 122, 0.15)",
  },
  lockTextWrap: {
    flex: 1,
  },
  lockTitle: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontFamily: "Inter-Bold",
  },
  lockMessage: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
});
