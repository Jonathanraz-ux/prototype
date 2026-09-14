import { describe, it, expect, beforeEach, beforeAll, jest } from "@jest/globals";
import { NativeModules, Platform } from "react-native";

// Modèle natif fidèle au garde-fou Kotlin (VpnBlockerModule.setAuthorized) :
// toute autorisation d'une génération obsolète est rejetée ; blockNow et
// invalidateGeneration annulent l'autorisation en cours.
function createFakeNative() {
  let generation = 0;
  let authExpiresAt = 0;
  const setAuthorized = jest.fn(async (gen: number, ttlMs: number) => {
    if (generation !== 0 && gen < generation) {
      return { ok: false, reason: "stale_generation", generation: gen, currentGeneration: generation };
    }
    generation = gen;
    authExpiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
    return { ok: true, generation: gen, authExpiresAt };
  });
  const blockNow = jest.fn(async () => {
    authExpiresAt = 0;
    return { ok: true, state: "BLOCKING" };
  });
  const invalidateGeneration = jest.fn(async () => {
    generation += 1;
    authExpiresAt = 0;
    return { ok: true, generation, state: "BLOCKING" };
  });
  const getStatus = jest.fn(async () => ({
    consentGranted: true,
    state: authExpiresAt > Date.now() ? "ALLOWED" : "BLOCKED",
    tunnelUp: authExpiresAt <= Date.now(),
    serviceRunning: true,
    generation,
    authTtlMs: Math.max(0, authExpiresAt - Date.now()),
  }));
  return {
    setAuthorized,
    blockNow,
    invalidateGeneration,
    getStatus,
    reset() {
      generation = 0;
      authExpiresAt = 0;
    },
  };
}

// Le service capture `NativeModules.VpnBlocker` à l'import (vpnBlocker.ts:52) :
// on branche la plateforme ET la fausse API native AVANT de charger le module.
const fake = createFakeNative();
(Platform as unknown as { OS: string }).OS = "android";
(NativeModules as Record<string, unknown>).VpnBlocker = {
  ...fake,
  isConsentGranted: jest.fn(async () => ({ granted: true })),
  startBlocking: jest.fn(async () => ({ ok: true, state: "BLOCKING" })),
  stop: jest.fn(async () => ({ ok: true })),
  logTrace: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

let service: typeof import("../vpnBlocker")["vpnBlocker"];

beforeAll(() => {
  jest.isolateModules(() => {
    service = require("../vpnBlocker").vpnBlocker;
  });
});

beforeEach(() => {
  fake.reset();
  jest.clearAllMocks();
});

describe("vpnBlocker — coordination avec le garde-fou natif", () => {
  it("succès : autorisation initiale acceptée avec la génération courante", async () => {
    const a = await service.setAuthorized(25_000);
    expect(a.ok).toBe(true);
    expect(a.generation).toBeGreaterThan(0);
  });

  it("renouvellement : un nouveau setAuthorized avec la génération courante reste accepté", async () => {
    const a = await service.setAuthorized(25_000);
    const b = await service.setAuthorized(10_000);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.generation).toBe(a.generation);
  });

  it("renouvellement après pause : invalidateGeneration puis nouvelle génération acceptée", async () => {
    const before = await service.setAuthorized(25_000);
    const newGen = await service.invalidateGeneration();
    expect(newGen).toBeGreaterThan(before.generation!);
    const after = await service.setAuthorized(25_000);
    expect(after.ok).toBe(true);
    expect(after.generation).toBe(newGen);
  });

  it("réponse tardive après pause : le garde-fou natif rejette la génération obsolète", async () => {
    await service.setAuthorized(25_000);
    const genBeforePause = await service.invalidateGeneration();
    // Un renouvellement qui serait « rétroactif » avec l'ancienne génération
    // est refusé par le natif (jamais d'extension après coup). Appel direct
    // au modèle natif car l'API JS n'émet que la génération courante.
    const late = await fake.setAuthorized(genBeforePause - 1, 25_000);
    expect(late.ok).toBe(false);
    expect(late.reason).toBe("stale_generation");
  });

  it("expiration : blockNow ramène authTtlMs à 0 (aucune prolongation locale)", async () => {
    await service.setAuthorized(25_000);
    await service.blockNow();
    const st = await service.getStatus();
    expect(st.authTtlMs).toBe(0);
  });
});