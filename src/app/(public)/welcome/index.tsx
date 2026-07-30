import React, { useRef, useEffect } from "react";
import { View, Text, Animated, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Wifi, Shield, Zap } from "lucide-react-native";
import { COLORS } from "../../../constants/theme";

const FEATURES = [
  { icon: Zap, label: "Accès instantané", desc: "Connectez-vous en quelques secondes" },
  { icon: Shield, label: "Sécurisé", desc: "Connexion chiffrée et protégée" },
  { icon: Wifi, label: "Haut débit", desc: "Jusqu'à 100 Mbps disponibles" }
];

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true })
      ]),
      Animated.timing(buttonAnim, { toValue: 1, duration: 400, useNativeDriver: true })
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Animated.View style={[styles.logoWrapper, { transform: [{ scale: logoScale }] }]}>
          <View style={styles.outerRing} />
          <View style={styles.innerRing} />
          <View style={styles.logoCircle}>
            <Wifi color={COLORS.primary} size={52} />
          </View>
        </Animated.View>

        <Text style={styles.title}>WiFi Zone</Text>
        <Text style={styles.subtitle}>
          Votre accès internet{"\n"}professionnel et sécurisé
        </Text>

        <View style={styles.featuresRow}>
          {FEATURES.map(({ icon: Icon, label }) => (
            <View key={label} style={styles.featurePill}>
              <Icon color={COLORS.accent} size={12} />
              <Text style={styles.featureText}>{label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.ctaSection, { opacity: buttonAnim, transform: [{ translateY: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
        <Pressable onPress={() => router.push("/(public)/login")} style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.9 : 1 }]}>
          <Text style={styles.primaryButtonText}>Commencer</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(public)/register")} style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.secondaryButtonText}>Créer un compte gratuitement</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          En continuant, vous acceptez nos{" "}
          <Text style={styles.disclaimerLink}>Conditions d'utilisation</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090B", justifyContent: "space-between", paddingHorizontal: 28, paddingTop: 60, paddingBottom: 48 },
  glowTop: { position: "absolute", top: -60, left: "25%", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(37, 99, 235, 0.08)" },
  glowBottom: { position: "absolute", bottom: -80, right: 0, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(56, 189, 248, 0.05)" },
  heroSection: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrapper: { alignItems: "center", justifyContent: "center", marginBottom: 36, position: "relative" },
  outerRing: { position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: "rgba(37, 99, 235, 0.12)" },
  innerRing: { position: "absolute", width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.18)" },
  logoCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: "rgba(37, 99, 235, 0.1)", borderWidth: 2, borderColor: COLORS.primary, alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 8 },
  title: { fontSize: 40, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter-Bold", textAlign: "center", marginBottom: 12, letterSpacing: 0.3 },
  subtitle: { fontSize: 16, color: "#A1A1AA", fontFamily: "Inter-Regular", textAlign: "center", lineHeight: 26, marginBottom: 28 },
  featuresRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  featurePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(56, 189, 248, 0.08)", borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  featureText: { fontSize: 11, color: COLORS.accent, fontFamily: "Inter-Regular" },
  ctaSection: { gap: 12 },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 10 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", fontFamily: "Inter-Bold", letterSpacing: 0.3 },
  secondaryButton: { backgroundColor: "rgba(24, 24, 27, 0.8)", borderRadius: 16, paddingVertical: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)" },
  secondaryButtonText: { color: "#D4D4D8", fontSize: 15, fontFamily: "Inter-Regular" },
  disclaimer: { textAlign: "center", fontSize: 11, color: "#52525B", fontFamily: "Inter-Regular", marginTop: 4 },
  disclaimerLink: { color: "#71717A", textDecorationLine: "underline" }
});
