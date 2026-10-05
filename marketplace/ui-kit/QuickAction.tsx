import React, { useRef } from "react";
import { View, Text, Pressable, Animated, Platform, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";

interface QuickActionProps extends Omit<PressableProps, "children"> {
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  onPress: () => void;
  testID?: string;
}

export default function QuickAction({
  label,
  subtitle,
  icon: Icon,
  color = COLORS.primary,
  onPress,
  testID
}: QuickActionProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, friction: 7, tension: 200, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)", borderless: false }}
      style={({ pressed }) => [
        {
          width: "47%",
          backgroundColor: COLORS.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
          paddingVertical: 20,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden"
        }
      ]}
    >
      <Animated.View style={{ alignItems: "center", transform: [{ scale }] }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${color}18`,
            marginBottom: 12
          }}
        >
          <Icon color={color} size={20} />
        </View>
        <Text
          style={{
            color: COLORS.white,
            fontSize: 14,
            fontFamily: "Inter-Bold"
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: COLORS.textMuted,
              fontSize: 11,
              fontFamily: "Inter-Regular",
              marginTop: 2
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
