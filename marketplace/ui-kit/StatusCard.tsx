import React from "react";
import { View, Text } from "react-native";
import { COLORS, RADIUS } from "../../src/constants/theme";

interface StatusCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
}

export default function StatusCard({ title, value, subtitle, icon, color = COLORS.primary }: StatusCardProps) {
  return (
    <View
      className="flex-1 rounded-2xl border border-white/5 p-4"
      style={{ backgroundColor: COLORS.card }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          {icon}
        </View>
        <Text className="text-xs text-zinc-500 flex-1" style={{ fontFamily: "Inter-Regular" }}>
          {title}
        </Text>
      </View>
      <Text className="text-xl font-bold text-white" style={{ fontFamily: "Inter-Bold" }}>
        {value}
      </Text>
      {subtitle && (
        <Text className="text-xs text-zinc-500 mt-1" style={{ fontFamily: "Inter-Regular" }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

