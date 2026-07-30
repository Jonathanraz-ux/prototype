import React, { useRef, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, Animated, TextInput, Alert } from "react-native";
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

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handleSave = async () => {
    if (!firstName || !lastName) return;
    setLoading(true);
    try {
      await updateProfile({ firstName, lastName, email, phone });
      router.back();
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-[#09090B]">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          <Pressable onPress={() => router.back()} className="mb-6 flex-row items-center gap-2">
            <ArrowLeft color={COLORS.textSecondary} size={18} />
            <Text className="text-zinc-400 text-sm" style={{ fontFamily: "Inter-Regular" }}>Retour</Text>
          </Pressable>

          <View className="mb-8">
            <Text className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "Inter-Bold" }}>
              Modifier le profil
            </Text>
            <Text className="text-zinc-400 text-base" style={{ fontFamily: "Inter-Regular" }}>
              Mettez à jour vos informations personnelles
            </Text>
          </View>

          <View className="gap-4">
            <View className="flex-row gap-3">
              <View className="flex-1 gap-2">
                <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Prénom</Text>
                <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} />
                </View>
              </View>
              <View className="flex-1 gap-2">
                <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Nom</Text>
                <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <User color={COLORS.textMuted} size={18} />
                  <TextInput value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} />
                </View>
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Email</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Mail color={COLORS.textMuted} size={18} />
                <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-sm text-zinc-300 ml-1" style={{ fontFamily: "Inter-Regular" }}>Téléphone</Text>
              <View className="flex-row items-center gap-3 rounded-2xl px-4 border h-14" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <Phone color={COLORS.textMuted} size={18} />
                <TextInput value={phone} onChangeText={setPhone} placeholder="+33 6 12 34 56 78" placeholderTextColor={COLORS.textMuted} className="flex-1 text-white text-base" style={{ fontFamily: "Inter-Regular" }} keyboardType="phone-pad" />
              </View>
            </View>

            <PrimaryButton title="Enregistrer" onPress={handleSave} loading={loading} icon={Save} />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
