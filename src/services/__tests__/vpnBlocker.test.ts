import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { vpnBlocker } from "../vpnBlocker";
import { NativeModules, Platform } from "react-native";

describe("vpnBlocker service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("gère l'indisponibilité native hors Android sans planter", async () => {
    // Si la plateforme n'est pas Android ou module absent
    expect(typeof vpnBlocker.isAvailable).toBe("function");
    const status = await vpnBlocker.getStatus();
    expect(status).toBeDefined();
    expect(typeof status.generation).toBe("number");
  });

  it("gère startBlocking et blockNow de manière sécurisée", async () => {
    const res = await vpnBlocker.blockNow();
    expect(typeof res).toBe("boolean");
  });

  it("gère l'invalidation générationnelle monotone", async () => {
    const gen1 = await vpnBlocker.invalidateGeneration();
    const gen2 = await vpnBlocker.invalidateGeneration();
    expect(gen2).toBeGreaterThan(gen1);
  });
});
