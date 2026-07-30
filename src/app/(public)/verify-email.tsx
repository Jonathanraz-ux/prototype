import React, { useRef, useState, useEffect } from "react";
import { View, Text, Animated, KeyboardAvoidingView, Platform, ScrollView, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { ShieldCheck, ArrowRight } from "lucide-react-native";
import PrimaryButton from "../../components/PrimaryButton";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { verifyEmail } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const handleVerify = async () => {
    if (!code || code.length < 4) {
      setError("Veuillez entrer le code de vérification");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await verifyEmail(code);
      router.replace("/(app)/(tabs)/dashboard");
    } catch (e: any) {
      setError(e.message || "Code invalide");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-[#09090B]">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 80, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }} className="items-center">
          <View className="w-20 h-20 rounded-2xl items-center justify-center mb-6" style={{ backgroundColor: `${COLORS.accent}15`, borderWidth: 1.5, borderColor: `${COLORS.accent}30` }}>
            <ShieldCheck color={COLORS.accent} size={32} />
          </View>

          <Text className="text-2xl font-bold text-white text-center mb-2" style={{ fontFamily: "Inter-Bold" }}>
            Vérification email
          </Text>
          <Text className="text-zinc-400 text-base text-center mb-8" style={{ fontFamily: "Inter-Regular" }}>
            Un code de vérification a été envoyé à votre adresse email
          </Text>

          <View className="w-full gap-5">
            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Code de vérification</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={COLORS.textMuted}
                  className="flex-1 text-white text-base text-center tracking-[8px]"
                  style={{ fontFamily: "Inter-Regular", fontSize: 22, letterSpacing: 8 }}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            {error ? <Text className="text-xs text-red-400 mx-1 text-center" style={{ fontFamily: "Inter-Regular" }}>{error}</Text> : null}

            <PrimaryButton title="Vérifier mon email" onPress={handleVerify} loading={loading} icon={ArrowRight} />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
