import {
  browserCapabilities,
  BROWSING_STATES,
  browseGateDecision,
  browseSuspensionText,
  type BrowseGateReason,
} from "../browsePolicy";
import type { ConnectionState } from "../../types";

const ALL_STATES: ConnectionState[] = [
  "idle",
  "ad_loading",
  "ad_active",
  "authorizing_wifi",
  "wifi_active",
  "paused",
  "quota_exhausted",
  "error",
  "disconnecting",
];

describe("browseGateDecision", () => {
  it("suspend sans réseau (transport none), quel que soit l'état", () => {
    for (const state of ALL_STATES) {
      const r = browseGateDecision({
        state,
        bannerPresent: false,
        transport: "none",
        requireWifi: true,
      });
      expect(r).toEqual({ allowed: false, reason: "offline" });
    }
  });

  it("suspend sur données mobiles lorsque requireWifi est vrai", () => {
    const r = browseGateDecision({
      state: "wifi_active",
      bannerPresent: true,
      transport: "cellular",
      requireWifi: true,
    });
    expect(r).toEqual({ allowed: false, reason: "cellular" });
  });

  it("ne suspend pas en cellular quand requireWifi est faux", () => {
    const r = browseGateDecision({
      state: "wifi_active",
      bannerPresent: true,
      transport: "cellular",
      requireWifi: false,
    });
    expect(r.allowed).toBe(true);
  });

  it("unknown ne suspend pas (on ne fabrique pas de fausse certitude)", () => {
    const r = browseGateDecision({
      state: "wifi_active",
      bannerPresent: true,
      transport: "unknown",
      requireWifi: true,
    });
    expect(r.allowed).toBe(true);
  });

  it("autorise wifi_active sans exiger la bannière (pub déjà vue)", () => {
    const r = browseGateDecision({
      state: "wifi_active",
      bannerPresent: false,
      transport: "wifi",
      requireWifi: true,
    });
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it("exige la bannière pendant ad_active", () => {
    expect(
      browseGateDecision({
        state: "ad_active",
        bannerPresent: true,
        transport: "wifi",
        requireWifi: true,
      }).allowed
    ).toBe(true);
    expect(
      browseGateDecision({
        state: "ad_active",
        bannerPresent: false,
        transport: "wifi",
        requireWifi: true,
      })
    ).toEqual({ allowed: false, reason: "preparing_ad" });
  });

  it("donne un motif pour chaque état non navigable", () => {
    const expected: Record<string, BrowseGateReason> = {
      idle: "no_session",
      ad_loading: "preparing_ad",
      authorizing_wifi: "authorizing",
      paused: "paused",
      quota_exhausted: "quota_exhausted",
      error: "error",
      disconnecting: "disconnecting",
    };
    for (const [state, reason] of Object.entries(expected)) {
      const r = browseGateDecision({
        state: state as ConnectionState,
        bannerPresent: true,
        transport: "wifi",
        requireWifi: true,
      });
      expect(r).toEqual({ allowed: false, reason });
    }
  });

  it("BROWSING_STATES ne contient que ad_active et wifi_active", () => {
    expect(BROWSING_STATES.has("ad_active")).toBe(true);
    expect(BROWSING_STATES.has("wifi_active")).toBe(true);
    expect(BROWSING_STATES.size).toBe(2);
  });
});

describe("browseSuspensionText", () => {
  it("fournit un titre et un message pour chaque motif", () => {
    const reasons: BrowseGateReason[] = [
      "preparing_ad",
      "authorizing",
      "paused",
      "quota_exhausted",
      "error",
      "disconnecting",
      "no_session",
      "offline",
      "cellular",
    ];
    for (const reason of reasons) {
      const text = browseSuspensionText(reason);
      expect(text.title).toMatch(/\S/);
      expect(text.message).toMatch(/\S/);
    }
  });
});

describe("browserCapabilities", () => {
  it("sans configuration : aucun contrôle réseau revendiqué, mesure indisponible", () => {
    const c = browserCapabilities({});
    expect(c.navigationControlScope).toBe("in_app_browser");
    expect(c.claimsRouterControl).toBe(false);
    expect(c.meterSource).toBe("simulated");
    expect(c.networkControlNature).toBe("simulated");
  });

  it("mode VPN démo simulé : simulation locale, aucun contrôle routeur", () => {
    const c = browserCapabilities({
      networkMode: "android_vpn_demo",
      providerKind: "simulated",
    });
    expect(c.claimsRouterControl).toBe(false);
    expect(c.meterSource).toBe("simulated");
    expect(c.networkControlNature).toBe("simulated");
  });

  it("mode MikroTik live : mesure routeur réelle revendiquée", () => {
    const c = browserCapabilities({
      networkMode: "mikrotik",
      providerKind: "live",
    });
    expect(c.claimsRouterControl).toBe(true);
    expect(c.meterSource).toBe("router_counters");
    expect(c.networkControlNature).toBe("real");
  });
});