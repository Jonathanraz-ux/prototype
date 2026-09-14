import React, { useRef, useState, useEffect } from "react";
import { View, Text, Animated, Pressable, KeyboardAvoidingView, Platform, ScrollView, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Mail, ArrowLeft, Send } from "lucide-react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import { COLORS } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthContext";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const handleReset = async () => {
    if (!email) {
      setError("Veuillez entrer votre email");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Animated.View style={[styles.sentScreen, { opacity: fadeAnim }]}>
        <View style={styles.sentIcon}>
          <Send color={COLORS.success} size={32} />
        </View>
        <Text style={styles.sentTitle}>Email envoyé</Text>
        <Text style={styles.sentText}>
          Si un compte existe avec cette adresse, vous recevrez un email de réinitialisation.
        </Text>
        <PrimaryButton title="Retour à la connexion" onPress={() => router.back()} />
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <ArrowLeft color={COLORS.textSecondary} size={18} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Mot de passe oublié</Text>
            <Text style={styles.headerSub}>
              Saisissez votre email pour recevoir un lien de réinitialisation
            </Text>
          </View>

          <View style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.field, { borderColor: error ? COLORS.danger : COLORS.borderLight }]}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="jean.dupont@email.com" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Adresse email" />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <PrimaryButton title="Envoyer le lien" onPress={handleReset} loading={loading} icon={Send} />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48 },
  backRow: { marginBottom: 32, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: "Inter-Regular" },
  header: { marginBottom: 32 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 28, fontFamily: "Inter-Bold", marginBottom: 6 },
  headerSub: { color: COLORS.textSecondary, fontSize: 15, fontFamily: "Inter-Regular" },
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
  sentScreen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  sentIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    backgroundColor: `${COLORS.success}15`,
    borderWidth: 1.5,
    borderColor: `${COLORS.success}30`
  },
  sentTitle: { color: COLORS.textPrimary, fontSize: 22, fontFamily: "Inter-Bold", textAlign: "center", marginBottom: 8 },
  sentText: { color: COLORS.textSecondary, fontSize: 15, textAlign: "center", marginBottom: 32, fontFamily: "Inter-Regular" }
});