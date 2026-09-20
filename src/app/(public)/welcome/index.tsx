import React, { useRef, useEffect } from "react";
import { View, Text, Animated, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Wifi, Shield, Zap } from "lucide-react-native";
import { COLORS } from "../../../constants/theme";
import BojoLogo from "../../../components/BojoLogo";

const FEATURES = [
  { icon: Zap, label: "Accès instantané", desc: "Connectez-vous en quelques secondes" },
  { icon: Shield, label: "Sécurisé", desc: "Connexion chiffrée et protégée" },
  { icon: Wifi, label: "Sponsorisé", desc: "Internet financé par la publicité" }
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
          <BojoLogo width={250} showTagline={true} />
        </Animated.View>

        <Text style={styles.subtitle}>
          Votre accès internet financé{"\n"}par la publicité
        </Text>

        <View style={styles.featuresRow}>
          {FEATURES.map(({ icon: Icon, label }) => (
            <View key={label} style={styles.featurePill}>
              <Icon color={COLORS.accentSoft} size={12} />
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
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: "space-between", paddingHorizontal: 28, paddingTop: 60, paddingBottom: 48 },
  glowTop: { position: "absolute", top: -60, left: "25%", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(125, 69, 246, 0.2)" },
  glowBottom: { position: "absolute", bottom: -80, right: 0, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(201, 180, 255, 0.1)" },
  heroSection: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrapper: { alignItems: "center", justifyContent: "center", marginBottom: 36, position: "relative" },
  outerRing: { position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: "rgba(125, 69, 246, 0.35)" },
  innerRing: { position: "absolute", width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: "rgba(201, 180, 255, 0.35)" },
  logoCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: "rgba(125, 69, 246, 0.25)", borderWidth: 2, borderColor: COLORS.white, alignItems: "center", justifyContent: "center", shadowColor: COLORS.backgroundDark, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 8 },
  title: { fontSize: 40, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter-Bold", textAlign: "center", marginBottom: 12, letterSpacing: 0.3 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, fontFamily: "Inter-Regular", textAlign: "center", lineHeight: 26, marginBottom: 28 },
  featuresRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  featurePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  featureText: { fontSize: 11, color: COLORS.textSecondary, fontFamily: "Inter-Regular" },
  ctaSection: { gap: 12 },
  primaryButton: { backgroundColor: "#FFFFFF", borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 10 },
  primaryButtonText: { color: "#5912ED", fontSize: 16, fontWeight: "700", fontFamily: "Inter-Bold", letterSpacing: 0.3 },
  secondaryButton: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 16, paddingVertical: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  secondaryButtonText: { color: COLORS.textPrimary, fontSize: 15, fontFamily: "Inter-Regular" },
  disclaimer: { textAlign: "center", fontSize: 11, color: COLORS.textMuted, fontFamily: "Inter-Regular", marginTop: 4 },
  disclaimerLink: { color: COLORS.textSecondary, textDecorationLine: "underline" }
});