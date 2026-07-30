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
  ActivityIndicator
} from "react-native";
import { useRouter } from "expo-router";
import { Mail, Lock, ArrowRight, Wifi } from "lucide-react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import { COLORS } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

          <View className="items-center mb-8">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{
                backgroundColor: `${COLORS.primary}15`,
                borderWidth: 1.5,
                borderColor: `${COLORS.primary}40`
              }}
            >
              <Wifi color={COLORS.primary} size={28} />
            </View>
            <Text
              className="text-3xl font-bold text-white mb-1"
              style={{ fontFamily: "Inter-Bold" }}
            >
              Bon retour
            </Text>
            <Text
              className="text-zinc-400 text-base text-center"
              style={{ fontFamily: "Inter-Regular" }}
            >
              Connectez-vous à votre compte WiFi Zone
            </Text>
          </View>

          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Email</Text>
              <View
                className="flex-row items-center gap-3 rounded-2xl px-4 border h-14"
                style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
              >
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="jean.dupont@email.com"
                  placeholderTextColor={COLORS.textMuted}
                  className="flex-1 text-white text-base"
                  style={{ fontFamily: "Inter-Regular" }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Mot de passe</Text>
              <View
                className="flex-row items-center gap-3 rounded-2xl px-4 border h-14"
                style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
              >
                <Lock color={COLORS.textMuted} size={18} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Entrez votre mot de passe"
                  placeholderTextColor={COLORS.textMuted}
                  className="flex-1 text-white text-base"
                  style={{ fontFamily: "Inter-Regular" }}
                  secureTextEntry
                />
              </View>
            </View>

            {error ? (
              <Text className="text-xs text-red-400 mx-1" style={{ fontFamily: "Inter-Regular" }}>
                {error}
              </Text>
            ) : null}

            <Pressable onPress={() => router.push("/(public)/login/forgot-password")} className="self-end">
              <Text className="text-sm" style={{ color: COLORS.accent, fontFamily: "Inter-Regular" }}>
                Mot de passe oublié ?
              </Text>
            </Pressable>

            <PrimaryButton
              title="Se connecter"
              onPress={handleLogin}
              loading={loading}
              icon={ArrowRight}
            />
          </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-zinc-500" style={{ fontFamily: "Inter-Regular" }}>
              Pas encore de compte ?{" "}
            </Text>
            <Pressable onPress={() => router.push("/(public)/register")}>
              <Text className="font-semibold" style={{ color: COLORS.accent, fontFamily: "Inter-Bold" }}>
                S'inscrire
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
