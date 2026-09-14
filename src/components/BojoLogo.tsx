import React from "react";
import { View, Image, Text, StyleSheet, ImageSourcePropType } from "react-native";

const bojoLogoImg: ImageSourcePropType = require("../assets/images/bojo-logo-full.png");

interface BojoLogoProps {
  width?: number;
  showTagline?: boolean;
  align?: "center" | "flex-start";
}

export default function BojoLogo({
  width = 220,
  showTagline = true,
  align = "center"
}: BojoLogoProps) {
  // Original ratio 1024 / 409 = ~2.5
  const height = width / 2.5;

  return (
    <View style={[styles.container, { alignItems: align }]}>
      <Image
        source={bojoLogoImg}
        style={{ width, height }}
        resizeMode="contain"
      />
      {showTagline && (
        <Text style={styles.tagline}>
          Internet Bôjô pour tous
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  tagline: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    letterSpacing: 0.2,
    opacity: 0.9,
    textAlign: "center"
  }
});
