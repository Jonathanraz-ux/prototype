import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import StatusCard from "../StatusCard";

describe("StatusCard", () => {
  it("renders title, value and subtitle", () => {
    const { getByText } = render(
      <StatusCard title="Temps restant" value="42 min" subtitle="sur 60 min" />
    );
    expect(getByText("Temps restant")).toBeTruthy();
    expect(getByText("42 min")).toBeTruthy();
    expect(getByText("sur 60 min")).toBeTruthy();
  });

  it("renders the icon node", () => {
    const { getByText } = render(
      <StatusCard title="Vitesse" value="10 Mb/s" icon={<Text>ICON</Text>} />
    );
    expect(getByText("ICON")).toBeTruthy();
  });

  it("omits the subtitle when not provided", () => {
    const { queryByText } = render(<StatusCard title="Quota" value="2 Go" />);
    expect(queryByText(/sur/)).toBeNull();
  });
});
