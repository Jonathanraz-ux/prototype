import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import GlassCard from "../GlassCard";

describe("GlassCard", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <GlassCard>
        <Text>Contenu de la carte</Text>
      </GlassCard>
    );
    expect(getByText("Contenu de la carte")).toBeTruthy();
  });

  it("is not interactive when pressable is false", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <GlassCard onPress={onPress}>
        <Text>Pas cliquable</Text>
      </GlassCard>
    );
    fireEvent(getByText("Pas cliquable"), "press");
    expect(onPress).not.toHaveBeenCalled();
  });

  it("fires onPress when pressable", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <GlassCard pressable onPress={onPress}>
        <Text>Cliquer</Text>
      </GlassCard>
    );
    fireEvent.press(getByText("Cliquer"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
