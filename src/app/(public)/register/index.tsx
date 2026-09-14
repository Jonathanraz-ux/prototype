import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  TextInput,
  StyleSheet
} from "react-native";
import { useRouter } from "expo-router";
import { User, Mail, Phone, Lock, ArrowRight } from "lucide-react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import { COLORS } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthContext";

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true })
    ]).start();
  }, []);

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register({ firstName, lastName, email, phone, password });
      router.replace("/(app)/(tabs)/dashboard");
    } catch (e: any) {
      setError(e.message || "Erreur lors de l'inscription");
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

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Créer un compte</Text>
            <Text style={styles.headerSub}>Rejoignez Bôjô dès maintenant</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={{ gap: 14 }}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Prénom</Text>
                <View style={styles.field}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={firstName} onChangeText={setFirstName} placeholder="Jean" placeholderTextColor={COLORS.textMuted} style={styles.input} accessibilityLabel="Prénom" />
                </View>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Nom</Text>
                <View style={styles.field}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={lastName} onChangeText={setLastName} placeholder="Dupont" placeholderTextColor={COLORS.textMuted} style={styles.input} accessibilityLabel="Nom" />
                </View>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Téléphone</Text>
              <View style={styles.field}>
                <Phone color={COLORS.textMuted} size={18} />
                <TextInput value={phone} onChangeText={setPhone} placeholder="+33 6 12 34 56 78" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="phone-pad" accessibilityLabel="Téléphone" />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.field}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="exemple@email.com" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Adresse email" />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.field}>
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Minimum 6 caractères" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry accessibilityLabel="Mot de passe" />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.field}>
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Répéter le mot de passe" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry accessibilityLabel="Confirmation du mot de passe" />
              </View>
            </View>

            <PrimaryButton title="Créer mon compte" onPress={handleRegister} loading={loading} icon={ArrowRight} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Déjà un compte ?{" "}</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.footerLink}>Se connecter</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48 },
  backRow: { marginBottom: 24 },
  backText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: "Inter-Regular" },
  header: { marginBottom: 20 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 28, fontFamily: "Inter-Bold", marginBottom: 4 },
  headerSub: { color: COLORS.textSecondary, fontSize: 15, fontFamily: "Inter-Regular" },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)"
  },
  errorText: { color: COLORS.danger, fontSize: 12, fontFamily: "Inter-Regular" },
  label: { color: COLORS.textSecondary, fontSize: 14, marginLeft: 4, fontFamily: "Inter-Regular" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    height: 56,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontFamily: "Inter-Regular" },
  row: { flexDirection: "row", gap: 10 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 28 },
  footerText: { color: COLORS.textMuted, fontFamily: "Inter-Regular" },
  footerLink: { color: COLORS.accent, fontFamily: "Inter-Bold" }
});