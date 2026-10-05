import React from "react";
import { render } from "@testing-library/react-native";

const mockConnection: Record<string, unknown> = {
  usage: {
    remainingQuotaMB: 0,
    totalQuotaMB: 5120,
    todayConsumptionMB: 0,
    remainingTimeMinutes: 0,
    totalTimeMinutes: 0,
  },
  networkProviderKind: "live",
  networkAgentSimulated: false,
  networkDetailVerified: false,
};

const mockAuth = {
  user: { id: "u1", email: "a@b.c" },
  logout: jest.fn(),
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("../../contexts/ConnectionContext", () => ({
  useConnection: () => mockConnection,
}));

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import AccountSection from "../AccountSection";

// « 0 Mo sur 5 Go » : la paire reste/total. On n'ancre pas sur « 5 Go »
// seul, qui apparaît aussi dans le texte honnête — le test passerait donc
// pour une mauvaise raison.
const QUOTA_TEXT = /sur 5,00 Go/;
const HONEST_TEXT = /comptage sera mesuré par le routeur/;

/**
 * Ces tests verrouillent une règle du projet : ne jamais présenter une
 * simulation ou un état inconnu comme un accès réseau réel.
 *
 * Avant le correctif, cet écran affichait « 0 min sur 0 min » dès que
 * `networkProviderKind === "live"`. Or cet indicateur vient de la
 * configuration LOCALE (EXPO_PUBLIC_NETWORK_MODE), pas du serveur : au
 * démarrage à froid, tout simulateur s'annonçait « réel ».
 */
describe("AccountSection — honnêteté des compteurs", () => {
  beforeEach(() => {
    mockConnection.networkProviderKind = "live";
    mockConnection.networkAgentSimulated = false;
    mockConnection.networkDetailVerified = true;
  });

  it("affiche les compteurs quand la chaîne est réelle ET vérifiée", () => {
    const { queryByText } = render(<AccountSection />);
    expect(queryByText(QUOTA_TEXT)).toBeTruthy();
    expect(queryByText(HONEST_TEXT)).toBeFalsy();
  });

  it("ne présente PAS de compteurs avant la réponse du serveur", () => {
    // C'est le faux vert du démarrage à froid : providerKind vaut déjà
    // « live » (config locale) alors que rien n'a été vérifié.
    mockConnection.networkDetailVerified = false;
    const { queryByText } = render(<AccountSection />);
    expect(queryByText(QUOTA_TEXT)).toBeFalsy();
    expect(queryByText(HONEST_TEXT)).toBeTruthy();
  });

  it("ne présente PAS de compteurs quand l'agent est simulé", () => {
    // providerKind « live » + agent simulé : le routeur de test ne mesure
    // rien. Les compteurs doivent disparaître.
    mockConnection.networkAgentSimulated = true;
    const { queryByText } = render(<AccountSection />);
    expect(queryByText(QUOTA_TEXT)).toBeFalsy();
    expect(queryByText(HONEST_TEXT)).toBeTruthy();
  });

  it("n'affiche rien de mesuré en configuration non réelle", () => {
    mockConnection.networkProviderKind = "mock";
    const { queryByText } = render(<AccountSection />);
    expect(queryByText(QUOTA_TEXT)).toBeFalsy();
  });
});