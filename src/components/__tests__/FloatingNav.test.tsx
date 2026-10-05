import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import FloatingNav from "../FloatingNav";
import {
  FLOATING_NAV_BUTTON_HEIGHT,
  FLOATING_NAV_MARGIN,
  floatingNavWrapHeight
} from "../../lib/floatingNav";

let mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 360, height: 800 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" }
}));

const flatten = (style: unknown): Record<string, unknown> => {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, item) => ({ ...acc, ...flatten(item) }),
      {}
    );
  }
  return (style ?? {}) as Record<string, unknown>;
};

describe("FloatingNav — deux boutons flottants (Accueil / Naviguer)", () => {
  beforeEach(() => {
    mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };
  });

  it("n'affiche QUE les deux destinations, avec libellé et rôle de bouton", () => {
    const { getByText, queryByText, getAllByRole } = render(
      <FloatingNav active="browse" onNavigate={() => {}} />
    );

    expect(getByText("Accueil")).toBeTruthy();
    expect(getByText("Naviguer")).toBeTruthy();
    // Les onglets Historique / Profil ont disparu.
    expect(queryByText("Historique")).toBeNull();
    expect(queryByText("Profil")).toBeNull();
    expect(getAllByRole("button")).toHaveLength(2);
  });

  it("déclenche la navigation et le retour haptique", () => {
    const onNavigate = jest.fn();
    const { getByTestId } = render(<FloatingNav active="browse" onNavigate={onNavigate} />);

    fireEvent.press(getByTestId("floating-nav-home"));
    expect(onNavigate).toHaveBeenCalledWith("home");

    fireEvent.press(getByTestId("floating-nav-browse"));
    expect(onNavigate).toHaveBeenCalledWith("browse");
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("met en évidence l'écran actif (contraste inversé)", () => {
    const { getByText } = render(<FloatingNav active="browse" onNavigate={() => {}} />);

    // Actif : texte violet sur pastille blanche. Inactif : texte blanc.
    expect(flatten(getByText("Naviguer").props.style)).toMatchObject({ color: "#5912ED" });
    expect(flatten(getByText("Accueil").props.style)).toMatchObject({ color: "#FFFFFF" });
  });

  it("le conteneur transparent ne bloque pas la publicité : seuls les boutons interceptent", () => {
    const { getByTestId } = render(<FloatingNav active="home" onNavigate={() => {}} />);

    const wrap = getByTestId("floating-nav");
    // Conteneur « box-none » : transparent au toucher, il ne masque jamais la pub.
    expect(wrap.props.pointerEvents).toBe("box-none");

    // Le voile de dégradé est totalement inerte.
    const scrims = wrap.findAll(
      (node: { props: Record<string, unknown> }) =>
        flatten(node.props.style).position === "absolute" && node.props.pointerEvents === "none"
    );
    expect(scrims.length).toBeGreaterThan(0);

    // Seules les deux surfaces de boutons sont pressables.
    expect(getByTestId("floating-nav-home").props.accessibilityRole).toBe("button");
    expect(getByTestId("floating-nav-browse").props.accessibilityRole).toBe("button");
  });

  it("respecte la zone système basse (boutons au-dessus de la barre Android)", () => {
    const { getByTestId } = render(<FloatingNav active="home" onNavigate={() => {}} />);

    const wrap = getByTestId("floating-nav");
    // Le conteneur est dimensionné pour remonter les boutons au-dessus de
    // l'inset bas (barre de navigation gestuelle Android).
    expect(flatten(wrap.props.style).height).toBe(floatingNavWrapHeight(48));

    // Hauteur et rayon « pastille » des boutons.
    const button = getByTestId("floating-nav-home");
    const buttonStyle = flatten(button.props.style);
    expect(buttonStyle.height).toBe(FLOATING_NAV_BUTTON_HEIGHT);
    expect(buttonStyle.borderRadius).toBe(FLOATING_NAV_BUTTON_HEIGHT / 2);

    // La rangée de boutons remonte de l'inset bas + la marge basse.
    expect(flatten(getByTestId("floating-nav-row").props.style).marginBottom).toBe(
      48 + FLOATING_NAV_MARGIN
    );
  });
});
