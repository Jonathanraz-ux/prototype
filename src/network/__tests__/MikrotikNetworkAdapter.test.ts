import { describe, it, expect, jest } from "@jest/globals";
import { MikrotikNetworkAdapter } from "../MikrotikNetworkAdapter";
import { resolveNetworkAdapter } from "../index";
import { AndroidVpnDemoAdapter } from "../AndroidVpnDemoAdapter";

const repo = jest.requireActual("../../repositories/sessionRepository") as Record<string, unknown>;

jest.mock("../../repositories/sessionRepository", () => ({
  requestWifiSession: jest.fn(),
  endWifiSession: jest.fn(),
  fetchQuotaStatus: jest.fn(),
}));

jest.mock("../../lib/mikrotikAuth", () => ({
  waitForMikrotikAuthorization: jest.fn(),
}));

jest.mock("../../lib/config", () => ({
  getConfig: () => ({ EXPO_PUBLIC_DEFAULT_SITE_ID: "site-1" }),
  isDevelopment: () => true,
}));

import { requestWifiSession, endWifiSession, fetchQuotaStatus } from "../../repositories/sessionRepository";
import { waitForMikrotikAuthorization } from "../../lib/mikrotikAuth";

const mockedAuthorization = waitForMikrotikAuthorization as jest.MockedFunction<
  typeof import("../../lib/mikrotikAuth").waitForMikrotikAuthorization
>;
const mockedRequestWifiSession = requestWifiSession as jest.MockedFunction<
  typeof import("../../repositories/sessionRepository").requestWifiSession
>;
const mockedEndWifiSession = endWifiSession as jest.MockedFunction<
  typeof import("../../repositories/sessionRepository").endWifiSession
>;
const mockedFetchQuotaStatus = fetchQuotaStatus as jest.MockedFunction<
  typeof import("../../repositories/sessionRepository").fetchQuotaStatus
>;

function adapter() {
  return new MikrotikNetworkAdapter({ enabled: true });
}

describe("factory resolveNetworkAdapter — séparation réel vs simulation", () => {
  it("mikrotik → fournisseur RÉEL (live)", () => {
    expect(resolveNetworkAdapter("mikrotik").providerKind).toBe("live");
  });
  it("radius → fournisseur RÉEL (live)", () => {
    expect(resolveNetworkAdapter("radius").providerKind).toBe("live");
  });
  it("android_vpn_demo → SIMULATION (jamais présentée comme réelle)", () => {
    const a = resolveNetworkAdapter("android_vpn_demo");
    expect(a.providerKind).toBe("simulated");
    expect(a).toBeInstanceOf(AndroidVpnDemoAdapter);
  });
  it("development/mock → SIMULATION", () => {
    expect(resolveNetworkAdapter("development").providerKind).toBe("simulated");
    expect(resolveNetworkAdapter("mock").providerKind).toBe("simulated");
  });
  it("non configuré → unconfigured (jamais READY)", async () => {
    const a = resolveNetworkAdapter("not_configured");
    expect(a.providerKind).toBe("unconfigured");
    expect(await a.healthCheck()).toBe("NOT_CONFIGURED");
  });
});

describe("MikrotikNetworkAdapter — authorizeSession via la chaîne serveur", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("confirme l'accès seulement si le serveur valide + l'agent confirme", async () => {
    mockedRequestWifiSession.mockResolvedValue({
      ok: true,
      outcome: "created",
      sessionId: "sess-abc",
      status: "authorizing",
    } as any);
    mockedAuthorization.mockResolvedValue({ ok: true } as any);

    const res = await adapter().authorizeSession({
      username: "user@test",
      siteId: "site-1",
      allocatedSeconds: 3600,
      allocatedBytes: 1024,
    });

    expect(res.success).toBe(true);
    expect((res as { reference: string }).reference).toBe("sess-abc");
    expect(mockedAuthorization).toHaveBeenCalledTimes(1);
  });

  it("refuse explicitement si la session est close côté serveur (routeur non confirmé)", async () => {
    mockedRequestWifiSession.mockResolvedValue({
      ok: true,
      outcome: "created",
      sessionId: "sess-abc",
      status: "authorizing",
    } as any);
    mockedAuthorization.mockResolvedValue({ ok: false, signal: { mode: "authorizing" } } as any);

    const res = await adapter().authorizeSession({
      username: "user@test",
      siteId: "site-1",
      allocatedSeconds: 3600,
      allocatedBytes: 1024,
    });
    expect(res.success).toBe(false);
    expect((res as { reason: string }).reason).toBe("router_not_confirmed");
  });

  it("mappe quota épuisé → refus explicite, jamais d'accès", async () => {
    mockedRequestWifiSession.mockResolvedValue({
      ok: true,
      outcome: "created",
      sessionId: "sess-abc",
      status: "authorizing",
    } as any);
    mockedAuthorization.mockResolvedValue({ ok: false, signal: { mode: "quota_exhausted" } } as any);

    const res = await adapter().authorizeSession({
      username: "user@test",
      siteId: "site-1",
      allocatedSeconds: 3600,
      allocatedBytes: 1024,
    });
    expect(res.success).toBe(false);
    expect((res as { reason: string }).reason).toBe("quota_exhausted");
  });

  it("refuse si requestWifiSession renvoie quota_exhausted", async () => {
    mockedRequestWifiSession.mockResolvedValue({
      ok: false,
      outcome: "quota_exhausted",
      reason: "quota_exhausted",
    } as any);
    const res = await adapter().authorizeSession({
      username: "user@test",
      siteId: "site-1",
      allocatedSeconds: 3600,
      allocatedBytes: 1024,
    });
    expect(res.success).toBe(false);
    expect((res as { reason: string }).reason).toBe("quota_exhausted");
    expect(mockedAuthorization).not.toHaveBeenCalled();
  });
});

describe("MikrotikNetworkAdapter — usage & déconnexion", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getSessionUsage lit quota-status (compteurs serveur), jamais de compteur local", async () => {
    mockedFetchQuotaStatus.mockResolvedValue({
      allocation: { quota_bytes: 1000, remaining_bytes: 400 },
      session: { session_id: "sess-abc", status: "active", router_session_reference: "mk-1" },
    } as any);
    const usage = await adapter().getSessionUsage("sess-abc");
    expect(usage.available).toBe(true);
    expect(usage.consumedBytes).toBe(600);
  });

  it("disconnectSession délègue à end-wifi-session (commande agent côté serveur)", async () => {
    mockedEndWifiSession.mockResolvedValue(true);
    await adapter().disconnectSession("sess-abc");
    expect(mockedEndWifiSession).toHaveBeenCalledWith("sess-abc", "USER_PAUSED_AD");
  });
});