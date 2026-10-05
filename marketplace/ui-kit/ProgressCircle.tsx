import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withSpring
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { COLORS } from "../../src/constants/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressCircleProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  label?: string;
  sublabel?: string;
}

export default function ProgressCircle({
  progress,
  size = 120,
  strokeWidth = 8,
  color = COLORS.primary,
  backgroundColor = COLORS.border,
  showLabel = true,
  label,
  sublabel
}: ProgressCircleProps) {
  const animatedProgress = useSharedValue(0);
  const scale = useSharedValue(0.85);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  useEffect(() => {
    animatedProgress.value = withTiming(clampedProgress / 100, { duration: 800 });
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value)
  }));

  const displayLabel = label || `${Math.round(clampedProgress)}%`;

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={backgroundColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
            animatedProps={animatedProps}
          />
        </Svg>
      </Animated.View>

      {showLabel && (
        <View
          className="absolute items-center justify-center"
          style={{ width: size, height: size }}
        >
          <Text className="text-xl font-bold" style={{ color, fontFamily: "Inter-Bold" }}>
            {displayLabel}
          </Text>
          {sublabel && (
            <Text className="text-xs text-zinc-500 mt-1" style={{ fontFamily: "Inter-Regular" }}>
              {sublabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
