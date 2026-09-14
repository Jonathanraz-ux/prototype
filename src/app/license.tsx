import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Clock, Ban, WifiOff, RefreshCw, PhoneCall } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { useLicense } from "../contexts/LicenseContext";
import { useAuth } from "../contexts/AuthContext";
import { getConfig } from "../lib/config";

/**
 * LicenceGateScreen — Écran affiché quand la licence n'est pas en état
 * "ok". Ne divulgue aucun secret ni détail technique.
 */
export default function LicenceGateScreen() {
  const { gate, refresh } = useLicense();
  const { logout } = useAuth();
  const router = useRouter();

  // Gérer les états permissifs (validation réactivée)
  useEffect(() => {
    if (gate.status === "ok") {
      router.replace("/(app)/(tabs)/dashboard");
    }
  }, [gate.status, router]);

  const config = getConfig();

  const configContent = () => {
    if (gate.status === "checking") {
      return {
        icon: <ActivityIndicator color={COLORS.accent} size={40} />,
        title: "Vérification de la licence",
        message: "Veuillez patienter pendant la vérification de votre abonnement.",
        color: COLORS.accent,
      };
    }
    if (gate.status === "expired") {
      return {
        icon: <Clock color={COLORS.warning} size={40} />,
        title: "Licence pilote expirée",
        message: "Votre licence pilote est arrivée à expiration. De nouvelles sessions Wi-Fi ne peuvent plus être ouvertes.",
        color: COLORS.warning,
      };
    }
    if (gate.status === "suspended") {
      return {
        icon: <Ban color={COLORS.danger} size={40} />,
        title: "Service temporairement suspendu",
        message: "Le service est temporairement suspendu. Contactez le support pour toute question.",
        color: COLORS.danger,
      };
    }
    return {
      icon: <WifiOff color={COLORS.textMuted} size={40} />,
      title: "Vérification de licence impossible",
      message: "Impossible de vérifier votre licence pour le moment. Vérifiez votre connexion et réessayez.",
      color: COLORS.textSecondary,
    };
  };

  const { icon, title, message, color } = configContent();

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#4A0EC8", "#5912ED"]} style={StyleSheet.absoluteFill} />
      <View style={styles.card}>
        <View style={[styles.iconWrap, { borderColor: `${color}40`, backgroundColor: `${color}15` }]}>
          {icon}
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {config.EXPO_PUBLIC_SUPPORT_EMAIL && (
          <View style={styles.supportRow}>
            <PhoneCall color={COLORS.textSecondary} size={16} />
            <Text style={styles.supportText}>{config.EXPO_PUBLIC_SUPPORT_EMAIL}</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {gate.status === "unreachable" && (
          <Pressable onPress={() => refresh()} style={styles.retryButton}>
            <RefreshCw color={COLORS.actionFg} size={18} />
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        )}
        {(gate.status === "expired" || gate.status === "suspended") && (
          <Pressable
            onPress={async () => {
              await logout();
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Se déconnecter</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 28,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginBottom: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 21,
    fontFamily: "Inter-Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: "Inter-Regular",
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  supportText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter-Regular",
  },
  actions: {
    width: "100%",
    marginTop: 28,
    gap: 12,
  },
  retryButton: {
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.actionBg,
    shadowColor: COLORS.backgroundDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  retryText: {
    color: COLORS.actionFg,
    fontSize: 15,
    fontFamily: "Inter-Bold",
  },
  secondaryButton: {
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  secondaryText: {
    color: COLORS.danger,
    fontSize: 14.5,
    fontFamily: "Inter-Bold",
  },
});
