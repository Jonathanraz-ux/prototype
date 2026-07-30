import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Pressable, Dimensions } from "react-native";
import { X, Eye, EyeOff } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { AdService } from "../services/ads";
import type { AdItem } from "../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function AdBanner() {
  const [ad, setAd] = useState<AdItem>(AdService.getCurrentAd());
  const [visible, setVisible] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AdService.startRotation((newAd) => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true })
      ]).start();
      setAd(newAd);
    });
    return () => AdService.stopRotation();
  }, [fadeAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const handleClose = () => {
    AdService.setAdVisible(false);
    setVisible(false);
    setShowWarning(true);
    Animated.timing(slideAnim, { toValue: -100, duration: 300, useNativeDriver: true }).start();
  };

  if (!visible && showWarning) {
    return (
      <View
        className="px-4 py-3"
        style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", borderTopWidth: 1, borderTopColor: "rgba(239, 68, 68, 0.3)" }}
      >
        <View className="flex-row items-center gap-2">
          <EyeOff color={COLORS.danger} size={16} />
          <Text className="text-xs flex-1" style={{ color: COLORS.danger, fontFamily: "Inter-Regular" }}>
            Publicité masquée — Connexion interrompue
          </Text>
        </View>
      </View>
    );
  }

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        transform: [{ scale: pulseAnim }, { translateY: slideAnim }]
      }}
    >
      <Pressable
        className="mx-4 mb-2 rounded-2xl overflow-hidden"
        style={{
          backgroundColor: ad.backgroundColor,
          borderWidth: 1,
          borderColor: `${ad.accentColor}30`
        }}
      >
        <View className="flex-row items-center px-4 py-3">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: `${ad.accentColor}20` }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                backgroundColor: ad.accentColor,
                opacity: 0.8
              }}
            />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-0.5">
              <Text
                className="text-xs font-semibold"
                style={{ color: "#fff", fontFamily: "Inter-Bold" }}
                numberOfLines={1}
              >
                {ad.title}
              </Text>
              <View
                className="px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${ad.accentColor}30` }}
              >
                <Text
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: ad.accentColor, fontFamily: "Inter-Bold" }}
                >
                  Pub
                </Text>
              </View>
            </View>
            <Text
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter-Regular" }}
              numberOfLines={1}
            >
              {ad.description}
            </Text>
          </View>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full items-center justify-center ml-2"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X color="rgba(255,255,255,0.6)" size={16} />
          </Pressable>
        </View>
        <View
          className="h-0.5"
          style={{ backgroundColor: `${ad.accentColor}40` }}
        />
        <View className="flex-row items-center justify-center py-1.5 px-4 gap-1">
          <Eye color="rgba(255,255,255,0.4)" size={10} />
          <Text
            className="text-[10px]"
            style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Inter-Regular" }}
          >
            Publicité financée — Gardez cette pub visible pour rester connecté
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
