/**
 * Fabrique d'adaptateur réseau — trois éléments vérifiés ISOLÉMENT.
 *
 *  1. `pickNetworkMode`     : fonction PURE, aucun accès à process.env.
 *  2. `resolveNetworkAdapter`: mode → adaptateur, et surtout NON-contournement
 *                            de la validation Zod de `lib/config.ts`.
 *  3. `readNetworkDetail`   : santé + honnêteté (agent de test vs routeur réel)
 *                            en un seul appel quand c'est possible.
 */

import {
  pickNetworkMode,
  resolveNetworkAdapter,
  readNetworkDetail,
} from "../index";
import type { NetworkAccessAdapter, NetworkHealth } from "../NetworkAccessAdapter";

// `DevelopmentNetworkAdapter` appelle `isDevelopment()` → `getConfig()` à la
// construction, qui valide l'environnement (Zod). En test on fournit un
// environnement valide minimal, exactement comme en production.
jest.mock("../../lib/config", () => ({
  isDevelopment: () => true,
  getConfig: () => ({ EXPO_PUBLIC_DEFAULT_SITE_ID: "site-1" }),
}));

function fakeAdapter(overrides: Partial<NetworkAccessAdapter> = {}): NetworkAccessAdapter {
  return {
    name: "fake",
    providerKind: "unconfigured",
    healthCheck: async (): Promise<NetworkHealth> => "ERROR",
    authorizeSession: async () =>
      ({ success: false, health: "ERROR", reason: "fake" } as never),
    getSessionUsage: async () => ({ consumedSeconds: 0, consumedBytes: 0, available: false }),
    disconnectSession: async () => {},
    ...overrides,
  } as NetworkAccessAdapter;
}

describe("1. pickNetworkMode — fonction pure (aucun process.env)", () => {
  it("respecte l'override (source de vérité : getConfig)", () => {
    expect(pickNetworkMode({ overrideMode: "mikrotik", envMode: "mock" })).toBe("mikrotik");
  });

  it("retombe sur envMode quand aucun override", () => {
    expect(pickNetworkMode({ envMode: "android_vpn_demo" })).toBe("android_vpn_demo");
  });

  it("normalise le synonyme interne `development` vers `mock`", () => {
    // `development` n'appartient PAS au NetworkMode public : il doit être
    // replié sur `mock` (même adaptateur), jamais exposé tel quel.
    expect(pickNetworkMode({ overrideMode: "development" })).toBe("mock");
  });

  it("mode inconnu -> adaptateur VIDE, jamais une simulation implicite", () => {
    // Point de sûreté : une valeur non reconnue ne doit surtout pas
    // pouvoir dégrader vers un adaptateur simulé.
    expect(pickNetworkMode({ overrideMode: "mikrotik_v2", isDev: true })).toBe("not_configured");
    expect(pickNetworkMode({ overrideMode: "RADIUS", isDev: false })).toBe("not_configured");
  });

  it("sans mode du tout -> mock en développement, vide sinon", () => {
    expect(pickNetworkMode({ isDev: true })).toBe("mock");
    expect(pickNetworkMode({ isDev: false })).toBe("not_configured");
    expect(pickNetworkMode({})).toBe("not_configured");
  });
});

describe("2. resolveNetworkAdapter — mode → fournisseur", () => {
  it("mikrotik = fournisseur RÉEL (providerKind live)", () => {
    expect(resolveNetworkAdapter("mikrotik").providerKind).toBe("live");
  });

  it("android_vpn_demo et mock = simulation assumée", () => {
    expect(resolveNetworkAdapter("android_vpn_demo").providerKind).toBe("simulated");
    expect(resolveNetworkAdapter("mock").providerKind).toBe("simulated");
    expect(resolveNetworkAdapter("development").providerKind).toBe("simulated");
  });

  it("not_configured et mode inconnu = ni réel ni simulé", () => {
    expect(resolveNetworkAdapter("not_configured").providerKind).toBe("unconfigured");
    expect(resolveNetworkAdapter("n_importe_quoi").providerKind).toBe("unconfigured");
  });

  it("NE CONSULTE PAS NETWORK_ADAPTER_TYPE (secret serveur)", () => {
    // Régression : ce secret est déclaré côté SERVEUR dans .env.example.
    // S'il se retrouve dans le .env chargé par Expo, il ne doit plus
    // pouvoir détourner l'adaptateur client ni court-circuiter le garde-fou
    // production de `getConfig()`.
    const before = process.env.NETWORK_ADAPTER_TYPE;
    process.env.NETWORK_ADAPTER_TYPE = "mock";
    try {
      const mode = pickNetworkMode({
        envMode: process.env.EXPO_PUBLIC_NETWORK_MODE,
        isDev: false,
      });
      expect(mode).not.toBe("mock");
    } finally {
      if (before === undefined) delete process.env.NETWORK_ADAPTER_TYPE;
      else process.env.NETWORK_ADAPTER_TYPE = before;
    }
  });
});

describe("3. readNetworkDetail — santé ET honnêteté en un appel", () => {
  it("routeur réel : agentSimulated = false, compteurs de confiance", async () => {
    const adapter = fakeAdapter({
      providerKind: "live",
      healthCheckDetail: async () => ({ health: "READY", simulated: false }),
    } as Partial<NetworkAccessAdapter>);

    const detail = await readNetworkDetail(adapter);
    expect(detail).toEqual({ health: "READY", agentSimulated: false });
  });

  it("agent de TEST : agentSimulated = true même si la chaîne répond READY", async () => {
    // Règle absolue : ne jamais présenter une simulation comme un accès
    // réseau réel. C'est précisément le piège du mock-router de l'agent.
    const adapter = fakeAdapter({
      providerKind: "live",
      healthCheckDetail: async () => ({ health: "READY", simulated: true }),
    } as Partial<NetworkAccessAdapter>);

    const detail = await readNetworkDetail(adapter);
    expect(detail).toEqual({ health: "READY", agentSimulated: true });
  });

  it("adaptateur SANS détail : replat sur healthCheck(), un seul appel", async () => {
    const healthCheck = jest.fn(async () => "UNREACHABLE" as NetworkHealth);
    const detail = await readNetworkDetail(fakeAdapter({ healthCheck }));

    // Sans détail, rien ne prouve un routeur réel : fail closed.
    expect(detail).toEqual({ health: "UNREACHABLE", agentSimulated: true });
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });

  it("détail en erreur : on ne casse PAS la connexion, on dégrade proprement", async () => {
    const healthCheck = jest.fn(async () => "UNREACHABLE" as NetworkHealth);
    const adapter = fakeAdapter({
      healthCheck,
      healthCheckDetail: async () => {
        throw new Error("gateway");
      },
    } as Partial<NetworkAccessAdapter>);

    const detail = await readNetworkDetail(adapter);
    expect(detail.health).toBe("UNREACHABLE");
    // Une lecture ratée ne vaut jamais confirmation de matériel réel.
    expect(detail.agentSimulated).toBe(true);
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });

  it("serveur ancien sans champ `simulated` : fail closed, PAS « routeur réel »", async () => {
    const adapter = fakeAdapter({
      healthCheckDetail: async () => ({ health: "READY" }),
    } as Partial<NetworkAccessAdapter>);

    // Un déploiement antérieur au champ `simulated` ne peut pas être
    // distingué d'un agent de test : on affiche « simulé » plutôt que
    // d'affirmer du matériel que personne n'a confirmé.
    const detail = await readNetworkDetail(adapter);
    expect(detail.agentSimulated).toBe(true);
  });
});
