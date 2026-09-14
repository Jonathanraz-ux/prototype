import React, { useRef } from "react";
import { View, Pressable, Animated } from "react-native";
import { COLORS, RADIUS } from "../constants/theme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: object;
  pressable?: boolean;
  onPress?: () => void;
  className?: string;
}

export default function GlassCard({ children, style, pressable = false, onPress, className }: GlassCardProps) {
  const [pressed, setPressed] = React.useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!pressable) return;
    Animated.spring(scaleAnim, { toValue: 0.98, friction: 8, useNativeDriver: true }).start();
    setPressed(true);
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }).start();
    setPressed(false);
  };

  const Card = (
    <Animated.View
      style={[
        {
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          borderWidth: 1,
          borderColor: pressed ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.14)",
          borderRadius: RADIUS.xl,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
          elevation: 12,
          transform: [{ scale: scaleAnim }]
        },
        style
      ]}
      className={className}
    >
      {children}
    </Animated.View>
  );

  if (pressable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {Card}
      </Pressable>
    );
  }

  return Card;
}
