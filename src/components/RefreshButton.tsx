import React, { useEffect, useRef } from "react";
import { Pressable, Animated, Easing, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RefreshCw } from "lucide-react-native";
import { GRADIENTS } from "../constants/theme";

interface RefreshButtonProps {
  refreshing: boolean;
  onPress: () => void;
}

export default function RefreshButton({ refreshing, onPress }: RefreshButtonProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!refreshing) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [refreshing, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={refreshing}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.86, friction: 6, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start()
      }
      style={styles.wrap}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={GRADIENTS.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.circle}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <RefreshCw color="#FFFFFF" size={19} strokeWidth={2.6} />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 46,
    height: 46,
    shadowColor: "#FF7A00",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)"
  }
});
