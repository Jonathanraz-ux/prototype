import React from "react";
import { render } from "@testing-library/react-native";
import WLogo from "../WLogo";

describe("WLogo", () => {
  it("renders without crashing with default props", () => {
    const { toJSON } = render(<WLogo />);
    expect(toJSON()).not.toBeNull();
  });

  it("renders the SVG root with the given testID", () => {
    const { getByTestId } = render(<WLogo size={48} testID="w-logo" />);
    expect(getByTestId("w-logo")).toBeTruthy();
  });

  it("applies custom size to the SVG viewport", () => {
    const { getByTestId } = render(<WLogo size={64} testID="w-logo-size" />);
    const svg = getByTestId("w-logo-size");
    expect(svg.props.width).toBe(64);
    expect(svg.props.height).toBe(64 * 0.8);
  });

  it("honors custom gradient colors", () => {
    const { getByTestId } = render(
      <WLogo size={32} colorStart="#111111" colorEnd="#222222" testID="w-logo-color" />
    );
    expect(getByTestId("w-logo-color")).toBeTruthy();
  });
});
