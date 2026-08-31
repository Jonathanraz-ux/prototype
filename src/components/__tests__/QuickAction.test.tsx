import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Zap } from "lucide-react-native";
import QuickAction from "../QuickAction";

describe("QuickAction", () => {
  it("renders label and subtitle", () => {
    const { getByText } = render(
      <QuickAction label="Vitesse" subtitle="Test" icon={Zap} onPress={() => {}} />
    );
    expect(getByText("Vitesse")).toBeTruthy();
    expect(getByText("Test")).toBeTruthy();
  });

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <QuickAction label="Quota" icon={Zap} onPress={onPress} testID="qa-quota" />
    );
    fireEvent.press(getByTestId("qa-quota"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders without subtitle", () => {
    const { queryByText } = render(
      <QuickAction label="Historique" icon={Zap} onPress={() => {}} />
    );
    expect(queryByText("Historique")).toBeTruthy();
  });
});
