import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  TextInput
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-[#09090B]"
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Pressable onPress={() => router.back()} className="mb-6 flex-row items-center">
            <Text className="text-zinc-400 text-sm" style={{ fontFamily: "Inter-Regular" }}>
              Retour
            </Text>
          </Pressable>

          <View className="mb-8">
            <Text className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "Inter-Bold" }}>
              Créer un compte
            </Text>
            <Text className="text-zinc-400 text-base" style={{ fontFamily: "Inter-Regular" }}>
              Rejoignez WiFi Zone dès maintenant
            </Text>
          </View>

          {error ? (
            <View className="mb-4 p-3 rounded-2xl" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" }}>
              <Text className="text-xs text-red-400" style={{ fontFamily: "Inter-Regular" }}>{error}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            <View className="flex-row gap-3">
              <View className="flex-1 gap-2">
                <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Prénom</Text>
                <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={firstName} onChangeText={setFirstName} placeholder="Jean" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} />
                </View>
              </View>
              <View className="flex-1 gap-2">
                <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Nom</Text>
                <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={lastName} onChangeText={setLastName} placeholder="Dupont" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} />
                </View>
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Téléphone</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Phone color={COLORS.textMuted} size={18} />
                <TextInput value={phone} onChangeText={setPhone} placeholder="+33 6 12 34 56 78" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} keyboardType="phone-pad" />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Email</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="exemple@email.com" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Mot de passe</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Minimum 6 caractères" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} secureTextEntry />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Confirmer le mot de passe</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Répéter le mot de passe" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} secureTextEntry />
              </View>
            </View>

            <PrimaryButton title="Créer mon compte" onPress={handleRegister} loading={loading} icon={ArrowRight} />
          </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
              Déjà un compte ?{" "}
            </Text>
            <Pressable onPress={() => router.back()}>
              <Text className="font-semibold" style={{ color: COLORS.accent, fontFamily: "Inter-Bold" }}>
                Se connecter
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
