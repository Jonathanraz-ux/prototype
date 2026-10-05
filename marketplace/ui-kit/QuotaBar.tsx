import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from "react-native-reanimated";
import { COLORS } from "../../src/constants/theme";

interface QuotaBarProps {
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
}

export default function QuotaBar({
  progress,
  color = COLORS.primary,
  trackColor = COLORS.border,
  height = 6
}: QuotaBarProps) {
  const animatedProgress = useSharedValue(0);
  const clamped = Math.min(Math.max(progress, 0), 100);

  useEffect(() => {
    animatedProgress.value = withTiming(clamped / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic)
    });
  }, [clamped]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`
  }));

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: trackColor,
        overflow: "hidden"
      }}
    >
      <Animated.View
        style={[
          barStyle,
          {
            height: "100%",
            borderRadius: height / 2,
            backgroundColor: color
          }
        ]}
      />
    </View>
  );
}
