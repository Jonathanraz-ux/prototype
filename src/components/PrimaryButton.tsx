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
  variant?: "primary" | "secondary";
  style?: object;
  className?: string;
}

export default function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon: Icon,
  variant = "primary",
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
  const isPrimary = variant === "primary";
  const bg = isPrimary ? COLORS.actionBg : COLORS.surface;
  const border = isPrimary ? "transparent" : COLORS.borderLight;
  const fg = isPrimary ? COLORS.actionFg : COLORS.textPrimary;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: "100%" }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        className={["rounded-2xl items-center justify-center border", className].filter(Boolean).join(" ")}
        style={[
          {
            backgroundColor: isDisabled ? COLORS.textMuted : bg,
            borderColor: border,
            paddingVertical: 16,
            paddingHorizontal: 24,
            shadowColor: !isDisabled && isPrimary ? COLORS.backgroundDark : "transparent",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 18,
            elevation: isPrimary ? 8 : 0,
            opacity: isDisabled ? 0.5 : 1
          },
          style
        ]}
      >
        <View className="flex-row items-center justify-center gap-2">
          {loading ? (
            <ActivityIndicator color={fg} size="small" />
          ) : (
            <>
              {Icon && <Icon color={fg} size={20} />}
              <Text className="text-base font-bold" style={{ color: fg, fontFamily: "Inter-Bold" }}>
                {title}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}