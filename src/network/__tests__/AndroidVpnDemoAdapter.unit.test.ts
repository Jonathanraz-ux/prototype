import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { NativeModules, Platform } from "react-native";

// ————————————————————————————————————————————————————————————
// Mock du module natif VpnBlocker avec contrôle fin :
// on simule le garde-fou Kotlin (stale_generation, ttl>0 → ALLOWED)
// ————————————————————————————————————————————————————————————
function createFakeNative() {
  let generation = 0;
  let authExpiresAt = 0;

  const setAuthorized = jest.fn(async (gen: number, ttlMs: number) => {
    if (generation !== 0 && gen < generation) {
      return {
        ok: false,
        reason: "stale_generation",
        generation: gen,
        currentGeneration: generation,
      };
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

// Installer le fake natif AVANT l'import du service vpnBlocker
const fake = createFakeNative();
(Platform as unknown as { OS: string }).OS = "android";
(NativeModules as Record<string, unknown>).VpnBlocker = {
  ...fake,
  isConsentGranted: jest.fn(async () => ({ granted: true })),
  prepare: jest.fn(async () => ({ granted: true, cancelled: false })),
  startBlocking: jest.fn(async () => ({ ok: true, state: "BLOCKING" })),
  stop: jest.fn(async () => ({ ok: true })),
  logTrace: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

let vpnBlockerService: typeof import("../../services/vpnBlocker")["vpnBlocker"];

beforeAll(() => {
  jest.isolateModules(() => {
    vpnBlockerService = require("../../services/vpnBlocker").vpnBlocker;
  });
});

beforeEach(() => {
  fake.reset();
  jest.clearAllMocks();
});

// ————————————————————————————————————————————————————————————
// Tests D.1 : AndroidVpnDemoAdapter — module natif simulé
// ————————————————————————————————————————————————————————————
describe("D.1 — AndroidVpnDemoAdapter avec module natif simulé", () => {
  it("authorizeSession refuse quand le module natif est disponible mais sans validation serveur", async () => {
    // Le module natif est mocké ci-dessus, donc isAvailable() = true.
    // L'adaptateur ne doit JAMAIS renvoyer success=true : il subordonne
    // toujours l'autorisation à une validation serveur explicite.
    const { AndroidVpnDemoAdapter } = require("../AndroidVpnDemoAdapter");
    const adapter = new AndroidVpnDemoAdapter();

    const res = await adapter.authorizeSession({
      username: "test",
      allocatedSeconds: 60,
      allocatedBytes: 1_000_000,
    });

    expect(res.success).toBe(false);
    expect(res).toHaveProperty("reason");
  });

  it("setAuthorized n'est JAMAIS appelé avec ttl>0 par l'adaptateur (pas d'autorisation aveugle)", async () => {
    const { AndroidVpnDemoAdapter } = require("../AndroidVpnDemoAdapter");
    const adapter = new AndroidVpnDemoAdapter();

    await adapter.authorizeSession({
      username: "test",
      allocatedSeconds: 60,
      allocatedBytes: 1_000_000,
    });

    // L'adaptateur appelle setAuthorized(0) pour forcer le blocage,
    // JAMAIS setAuthorized avec ttl>0 (autorisation).
    const calls = fake.setAuthorized.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[1]).toBe(0);
    }
  });

  it("healthCheck retourne READY quand le consentement est accordé", async () => {
    const { AndroidVpnDemoAdapter } = require("../AndroidVpnDemoAdapter");
    const adapter = new AndroidVpnDemoAdapter();

    const health = await adapter.healthCheck();
    expect(health).toBe("READY");
  });

  it("disconnectSession appelle blockNow pour couper le trafic", async () => {
    const { AndroidVpnDemoAdapter } = require("../AndroidVpnDemoAdapter");
    const adapter = new AndroidVpnDemoAdapter();

    await adapter.disconnectSession("test-session");
    expect(fake.blockNow).toHaveBeenCalled();
  });
});

// ————————————————————————————————————————————————————————————
// Tests D.2 : vpnBlocker — cycle ALLOWED → expiration → re-blocage
// ————————————————————————————————————————————————————————————
describe("D.2 — vpnBlocker : cycle ALLOWED → expiration → re-blocage", () => {
  it("setAuthorized avec ttl>0 autorise, puis blockNow coupe", async () => {
    const a = await vpnBlockerService.setAuthorized(25_000);
    expect(a.ok).toBe(true);

    const st1 = await vpnBlockerService.getStatus();
    expect(st1.state).toBe("ALLOWED");

    await vpnBlockerService.blockNow();

    const st2 = await vpnBlockerService.getStatus();
    expect(st2.authTtlMs).toBe(0);
    expect(st2.state).toBe("BLOCKED");
  });

  it("heartbeat échoue → blockNow + invalidateGeneration → stale_generation rejeté", async () => {
    // Simule un heartbeat réussi
    const a = await vpnBlockerService.setAuthorized(25_000);
    expect(a.ok).toBe(true);
    const gen = a.generation;

    // Simule un heartbeat échoué : blockNow + invalidateGeneration
    await vpnBlockerService.blockNow();
    const newGen = await vpnBlockerService.invalidateGeneration();
    expect(newGen).toBeGreaterThan(gen);

    // Un heartbeat tardif avec l'ancienne génération est rejeté
    const stale = await fake.setAuthorized(gen, 25_000);
    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe("stale_generation");
  });
});

// ————————————————————————————————————————————————————————————
// Tests D.3 : Pause volontaire ≠ reprise automatique
// ————————————————————————————————————————————————————————————
describe("D.3 — Pause volontaire : pas de reprise automatique au retour premier plan", () => {
  it("invalidateGeneration après pause rend toute autorisation tardive invalide", async () => {
    // Session ALLOWED
    const a = await vpnBlockerService.setAuthorized(25_000);
    expect(a.ok).toBe(true);

    // Pause volontaire : invalidateGeneration + blockNow
    await vpnBlockerService.blockNow();
    const newGen = await vpnBlockerService.invalidateGeneration();

    // L'état est maintenant BLOCKED
    const st = await vpnBlockerService.getStatus();
    expect(st.state).toBe("BLOCKED");
    expect(st.authTtlMs).toBe(0);

    // Un setAuthorized avec la VIEILLE génération (avant pause) est rejeté
    const late = await fake.setAuthorized(a.generation!, 25_000);
    expect(late.ok).toBe(false);

    // Seule une nouvelle génération (revalidation serveur) peut rouvrir
    const fresh = await vpnBlockerService.setAuthorized(25_000);
    expect(fresh.ok).toBe(true);
    expect(fresh.generation).toBe(newGen);
  });
});
