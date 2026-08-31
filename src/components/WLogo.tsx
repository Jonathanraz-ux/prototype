import React, { useRef } from "react";
import Svg, { Defs, LinearGradient, Stop, Path } from "react-native-svg";

let uid = 0;
function nextGradientId() {
  return `wlogo-grad-${++uid}`;
}

export interface WLogoProps {
  size?: number;
  colorStart?: string;
  colorEnd?: string;
  strokeWidth?: number;
  testID?: string;
}

export default function WLogo({
  size = 48,
  colorStart = "#2563EB",
  colorEnd = "#38BDF8",
  strokeWidth = 18,
  testID
}: WLogoProps) {
  const gradientId = useRef(nextGradientId()).current;

  return (
    <Svg testID={testID} width={size} height={size * 0.8} viewBox="0 0 100 80">
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={colorStart} />
          <Stop offset="100%" stopColor={colorEnd} />
        </LinearGradient>
      </Defs>
      <Path
        d="M6 70 L28 4 L50 62 L72 4 L94 70"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
