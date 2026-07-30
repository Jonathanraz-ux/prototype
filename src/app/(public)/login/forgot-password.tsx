import React, { useRef, useState, useEffect } from "react";
import { View, Text, Animated, Pressable, KeyboardAvoidingView, Platform, ScrollView, TextInput } from "react-native";
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
      <Animated.View className="flex-1 bg-[#09090B] items-center justify-center px-8" style={{ opacity: fadeAnim }}>
        <View className="w-20 h-20 rounded-2xl items-center justify-center mb-6" style={{ backgroundColor: `${COLORS.success}15`, borderWidth: 1.5, borderColor: `${COLORS.success}30` }}>
          <Send color={COLORS.success} size={32} />
        </View>
        <Text className="text-2xl font-bold text-white text-center mb-2" style={{ fontFamily: "Inter-Bold" }}>
          Email envoyé
        </Text>
        <Text className="text-zinc-400 text-base text-center mb-8" style={{ fontFamily: "Inter-Regular" }}>
          Si un compte existe avec cette adresse, vous recevrez un email de réinitialisation.
        </Text>
        <PrimaryButton title="Retour à la connexion" onPress={() => router.back()} />
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-[#09090B]">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          <Pressable onPress={() => router.back()} className="mb-8 flex-row items-center gap-2">
            <ArrowLeft color={COLORS.textSecondary} size={18} />
            <Text className="text-zinc-400 text-sm" style={{ fontFamily: "Inter-Regular" }}>Retour</Text>
          </Pressable>

          <View className="mb-8">
            <Text className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "Inter-Bold" }}>
              Mot de passe oublié
            </Text>
            <Text className="text-zinc-400 text-base" style={{ fontFamily: "Inter-Regular" }}>
              Saisissez votre email pour recevoir un lien de réinitialisation
            </Text>
          </View>

          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Email</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="jean.dupont@email.com" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            {error ? <Text className="text-xs text-red-400 mx-1" style={{ fontFamily: "Inter-Regular" }}>{error}</Text> : null}

            <PrimaryButton title="Envoyer le lien" onPress={handleReset} loading={loading} icon={Send} />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
