import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import PrimaryButton from "../PrimaryButton";

describe("PrimaryButton", () => {
  it("renders the title", () => {
    const { getByText } = render(<PrimaryButton title="Se connecter" onPress={jest.fn()} />);
    expect(getByText("Se connecter")).toBeTruthy();
  });

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton title="Go" onPress={onPress} />);
    fireEvent.press(getByText("Go"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and hides the label while loading", () => {
    const { queryByText } = render(<PrimaryButton title="Go" onPress={jest.fn()} loading />);
    expect(queryByText("Go")).toBeNull();
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton title="Go" onPress={onPress} disabled />);
    fireEvent.press(getByText("Go"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not fire onPress while loading", () => {
    const onPress = jest.fn();
    const { queryByText } = render(<PrimaryButton title="Go" onPress={onPress} loading />);
    expect(queryByText("Go")).toBeNull();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders an icon when provided", () => {
    const Icon = () => (
      <Text testID="icon">ICON</Text>
    );
    const { getByTestId } = render(
      <PrimaryButton title="Go" onPress={jest.fn()} icon={Icon as never} />
    );
    expect(getByTestId("icon")).toBeTruthy();
  });
});
