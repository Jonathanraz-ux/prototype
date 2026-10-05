import React from "react";
import { render } from "@testing-library/react-native";
import ProgressCircle from "../ProgressCircle";

describe("ProgressCircle", () => {
  it("renders the rounded percentage label by default", () => {
    const { getByText } = render(<ProgressCircle progress={75} />);
    expect(getByText("75%")).toBeTruthy();
  });

  it("renders a custom label and sublabel", () => {
    const { getByText } = render(
      <ProgressCircle progress={50} label="50 Go" sublabel="restants" />
    );
    expect(getByText("50 Go")).toBeTruthy();
    expect(getByText("restants")).toBeTruthy();
  });

  it("clamps progress above 100 to 100%", () => {
    const { getByText } = render(<ProgressCircle progress={150} />);
    expect(getByText("100%")).toBeTruthy();
  });

  it("clamps progress below 0 to 0%", () => {
    const { getByText } = render(<ProgressCircle progress={-20} />);
    expect(getByText("0%")).toBeTruthy();
  });

  it("hides the label when showLabel is false", () => {
    const { queryByText } = render(<ProgressCircle progress={50} showLabel={false} />);
    expect(queryByText("50%")).toBeNull();
  });
});
