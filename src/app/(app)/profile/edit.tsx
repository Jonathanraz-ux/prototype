import React, { useRef, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, Animated, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, User, Mail, Phone, Save } from "lucide-react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import { COLORS } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthContext";

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handleSave = async () => {
    if (!firstName || !lastName) return;
    setLoading(true);
    try {
      await updateProfile({ firstName, lastName, phone });
      router.back();
    } catch (e) {
      const err = e as Error;
      setError(err.message ?? "Impossible de mettre à jour le profil.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <ArrowLeft color={COLORS.textSecondary} size={18} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Modifier le profil</Text>
            <Text style={styles.headerSub}>Mettez à jour vos informations personnelles</Text>
          </View>

          <View style={{ gap: 14 }}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Prénom</Text>
                <View style={styles.field}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={COLORS.textMuted} style={styles.input} accessibilityLabel="Prénom" />
                </View>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Nom</Text>
                <View style={styles.field}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={COLORS.textMuted} style={styles.input} accessibilityLabel="Nom" />
                </View>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.field}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Adresse email" />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Téléphone</Text>
              <View style={styles.field}>
                <Phone color={COLORS.textMuted} size={18} />
                <TextInput value={phone} onChangeText={setPhone} placeholder="+33 6 12 34 56 78" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="phone-pad" accessibilityLabel="Téléphone" />
              </View>
            </View>

            <PrimaryButton title="Enregistrer" onPress={handleSave} loading={loading} icon={Save} />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48 },
  backRow: { marginBottom: 24, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: "Inter-Regular" },
  header: { marginBottom: 24 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 28, fontFamily: "Inter-Bold", marginBottom: 6 },
  headerSub: { color: COLORS.textSecondary, fontSize: 15, fontFamily: "Inter-Regular" },
  errorBox: {
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
  row: { flexDirection: "row", gap: 10 }
});