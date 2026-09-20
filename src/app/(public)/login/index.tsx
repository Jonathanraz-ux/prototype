import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  StyleSheet
} from "react-native";
import { useRouter } from "expo-router";
import { Mail, Lock, ArrowRight } from "lucide-react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import BojoLogo from "../../../components/BojoLogo";
import { COLORS } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthContext";
import { isProduction } from "../../../lib/config";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const showDemoFill = !isProduction();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true })
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/(app)/(tabs)/dashboard");
    } catch (e: any) {
      setError(e.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <Text style={styles.backText}>Retour</Text>
          </Pressable>

          <View style={styles.logoWrap}>
            <BojoLogo width={220} showTagline={true} />
            <Text style={styles.logoSub}>Connectez-vous à votre compte Bôjô</Text>
          </View>

          <View style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.field, { borderColor: error ? COLORS.danger : COLORS.borderLight }]}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="jean.dupont@email.com"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  accessibilityLabel="Adresse email"
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={[styles.field, { borderColor: error ? COLORS.danger : COLORS.borderLight }]}>
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Entrez votre mot de passe"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  secureTextEntry
                  accessibilityLabel="Mot de passe"
                />
              </View>
            </View>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <Pressable onPress={() => router.push("/(public)/login/forgot-password")} style={{ alignSelf: "flex-end" }}>
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </Pressable>

            <PrimaryButton title="Se connecter" onPress={handleLogin} loading={loading} icon={ArrowRight} />

            {showDemoFill && (
              <Pressable
                onPress={() => {
                  setEmail("demo@wifizone.app");
                  setPassword("");
                  setError("");
                }}
                style={({ pressed }) => [styles.demoButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.demoTitle}>Remplir avec le compte de test démo</Text>
                <Text style={styles.demoSub}>demo@wifizone.app — mot de passe communiqué séparément</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Pas encore de compte ?{" "}</Text>
            <Pressable onPress={() => router.push("/(public)/register")}>
              <Text style={styles.footerLink}>S'inscrire</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48 },
  backRow: { marginBottom: 24 },
  backText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: "Inter-Regular" },
  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoSub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 14, fontFamily: "Inter-Regular" },
  label: { color: COLORS.textSecondary, fontSize: 14, marginLeft: 4, fontFamily: "Inter-Regular" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    height: 56,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontFamily: "Inter-Regular" },
  errorText: { color: COLORS.danger, fontSize: 12, marginHorizontal: 4, fontFamily: "Inter-Regular" },
  forgotText: { color: COLORS.accent, fontSize: 14, fontFamily: "Inter-Regular" },
  demoButton: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    alignItems: "center"
  },
  demoTitle: { color: COLORS.textPrimary, fontSize: 12, fontFamily: "Inter-Bold" },
  demoSub: { color: COLORS.textMuted, fontSize: 10, marginTop: 3, fontFamily: "Inter-Regular" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  footerText: { color: COLORS.textMuted, fontFamily: "Inter-Regular" },
  footerLink: { color: COLORS.accent, fontFamily: "Inter-Bold" }
});