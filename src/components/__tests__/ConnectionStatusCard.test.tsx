import React from "react";
import { render } from "@testing-library/react-native";
import ConnectionStatusCard from "../ConnectionStatusCard";

/**
 * `providerKind` décrit la configuration LOCALE (EXPO_PUBLIC_NETWORK_MODE),
 * pas la réalité du routeur. Ces tests verrouillent l'absence de faux vert
 * au démarrage à froid : avant le correctif, un agent simulé s'annonçait
 * « Accès réseau réel (MikroTik) » avec des compteurs à zéro.
 */
const baseProps = {
  connected: false,
  percent: 0,
  timeMinutes: 0,
  quotaMB: 0,
  networkHealth: "NOT_CONFIGURED",
  providerKind: "live" as const,
};

describe("ConnectionStatusCard — pas de faux « accès réel »", () => {
  it("annonce le mode réseau à confirmer avant toute réponse du serveur", () => {
    const { getByText } = render(
      <ConnectionStatusCard {...baseProps} agentSimulated={false} detailVerified={false} />
    );
    expect(getByText("Mode réseau à confirmer")).toBeTruthy();
    // Ni « réel » ni « simulé » : on ne devine pas.
    expect(() => getByText("Accès réseau réel (MikroTik)")).toThrow();
    expect(() => getByText("Routeur simulé (agent de test)")).toThrow();
  });

  it("masque les compteurs tant que la chaîne n'est pas vérifiée", () => {
    const { getByText } = render(
      <ConnectionStatusCard {...baseProps} percent={88} detailVerified={false} />
    );
    expect(() => getByText("88%")).toThrow();
    // La branche non fiable montre la note honnête, pas des zéros.
    expect(getByText(/comptage|mesur|routeur/i)).toBeTruthy();
  });

  it("ne dit PAS « réel » quand l'agent est simulé, même vérifié", () => {
    const { getByText } = render(
      <ConnectionStatusCard {...baseProps} agentSimulated detailVerified />
    );
    expect(getByText("Routeur simulé (agent de test)")).toBeTruthy();
    expect(() => getByText("Accès réseau réel (MikroTik)")).toThrow();
  });

  it("affiche « réel » et les compteurs seulement quand tout est confirmé", () => {
    const { getByText } = render(
      <ConnectionStatusCard
        {...baseProps}
        connected
        percent={42}
        detailVerified
        agentSimulated={false}
        lastSyncAt="2026-10-05T10:00:00.000Z"
      />
    );
    expect(getByText("Accès réseau réel (MikroTik)")).toBeTruthy();
    expect(getByText("42%")).toBeTruthy();
  });

  it("meterTrusted fourni par le parent reste prioritaire", () => {
    // Le parent peut seul décider (ex. quota de démonstration) : on ne doit
    // pas écraser son verdict, mais il ne peut pas non plus rouvrir un
    // compteur sur un agent simulé.
    const { getByText } = render(
      <ConnectionStatusCard {...baseProps} agentSimulated meterTrusted={false} detailVerified />
    );
    expect(getByText("Routeur simulé (agent de test)")).toBeTruthy();
    expect(() => getByText("--")).toThrow();
  });
});