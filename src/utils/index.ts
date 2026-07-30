import { Dimensions } from "react-native";
import { SPACING, BREAKPOINTS } from "../constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const wp = (percentage: number): number => {
  return (percentage * SCREEN_WIDTH) / 100;
};

export const hp = (percentage: number): number => {
  return (percentage * SCREEN_HEIGHT) / 100;
};

export const RF = (size: number): number => {
  return SCREEN_WIDTH < BREAKPOINTS.sm ? size * 0.85 : size;
};
