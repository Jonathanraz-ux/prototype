import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../../constants/theme";
import WLogo from "../../../components/WLogo";

function AnimatedDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(800 - delay)
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.primary,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }]
      }}
    />
  );
}

export default function SplashScreen() {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const logoOffset = useRef(new Animated.Value(40)).current;
  const ringScale = useRef(new Animated.Value(0.7)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.spring(logoOffset, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      Animated.spring(ringScale, { toValue: 1, tension: 40, friction: 8, useNativeDriver: true })
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringScale, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(ringScale, { toValue: 1, duration: 1800, useNativeDriver: true })
      ])
    );
    setTimeout(() => pulse.start(), 700);

    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        router.replace("/(public)/welcome");
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.glowBg, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateY: logoOffset }], alignItems: "center" }}>
        <Animated.View style={[styles.outerRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <View style={styles.logoContainer}>
          <WLogo size={56} />
        </View>
        <Text style={styles.appName}>WiFi Zone</Text>
        <Text style={styles.tagline}>CONNEXION PREMIUM</Text>
      </Animated.View>
      <View style={styles.dotsContainer}>
        <AnimatedDot delay={0} />
        <AnimatedDot delay={200} />
        <AnimatedDot delay={400} />
      </View>
      <Text style={styles.version}>v1.0.0</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090B", alignItems: "center", justifyContent: "center" },
  glowBg: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(37, 99, 235, 0.08)" },
  outerRing: { position: "absolute", width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: "rgba(56, 189, 248, 0.2)" },
  logoContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(37, 99, 235, 0.12)", borderWidth: 2, borderColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: 28, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  appName: { fontSize: 34, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter-Bold", letterSpacing: 0.5, marginBottom: 8 },
  tagline: { fontSize: 11, color: "#71717A", fontFamily: "Inter-Regular", letterSpacing: 4, textTransform: "uppercase" },
  dotsContainer: { position: "absolute", bottom: 80, flexDirection: "row", gap: 10, alignItems: "center" },
  version: { position: "absolute", bottom: 48, fontSize: 11, color: "#3F3F46", fontFamily: "Inter-Regular" }
});
