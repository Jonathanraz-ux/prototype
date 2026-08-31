import React from "react";
import { render } from "@testing-library/react-native";
import QuotaBar from "../QuotaBar";

describe("QuotaBar", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<QuotaBar progress={50} />);
    expect(toJSON()).not.toBeNull();
  });

  it("clamps progress above 100", () => {
    const { toJSON } = render(<QuotaBar progress={150} />);
    expect(toJSON()).not.toBeNull();
  });

  it("clamps progress below 0", () => {
    const { toJSON } = render(<QuotaBar progress={-20} />);
    expect(toJSON()).not.toBeNull();
  });

  it("renders with custom color and height", () => {
    const { toJSON } = render(<QuotaBar progress={30} color="#F59E0B" height={8} />);
    expect(toJSON()).not.toBeNull();
  });
});
