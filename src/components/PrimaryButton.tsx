import React, { useRef } from "react";
import { View, Text, ActivityIndicator, Animated, Pressable } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { COLORS } from "../constants/theme";

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  style?: object;
  className?: string;
}

export default function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon: Icon,
  style,
  className
}: PrimaryButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, friction: 8, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }).start();
  };

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: "100%" }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        className={["rounded-2xl items-center justify-center", className].filter(Boolean).join(" ")}
        style={[
          {
            backgroundColor: isDisabled ? COLORS.borderLight : COLORS.primary,
            paddingVertical: 16,
            paddingHorizontal: 24,
            shadowColor: !isDisabled ? COLORS.primary : "transparent",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 8,
            opacity: isDisabled ? 0.6 : 1
          },
          style
        ]}
      >
        <View className="flex-row items-center justify-center gap-2">
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              {Icon && <Icon color="#fff" size={20} />}
              <Text className="text-base font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
                {title}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
