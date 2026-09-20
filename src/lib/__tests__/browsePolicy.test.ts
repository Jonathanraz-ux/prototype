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
  it("suspend sans réseau (transport none) sans tunnel VPN, quel que soit l'état", () => {
    for (const state of ALL_STATES) {
      const r = browseGateDecision({
        state,
        bannerPresent: false,
        transport: "none",
        requireWifi: true,
      });
      expect(r).toEqual({ allowed: false, reason: "offline", preservePage: false });
    }
  });

  it("transport none AVEC notre tunnel VPN actif = vérification, PAS offline, page conservée", () => {
    for (const state of ALL_STATES) {
      const r = browseGateDecision({
        state,
        bannerPresent: false,
        transport: "none",
        requireWifi: true,
        vpnTunnelUp: true,
      });
      expect(r).toEqual({ allowed: false, reason: "verifying", preservePage: true });
    }
  });

  it("suspend sur données mobiles lorsque requireWifi est vrai", () => {
    const r = browseGateDecision({
      state: "wifi_active",
      bannerPresent: true,
      transport: "cellular",
      requireWifi: true,
    });
    expect(r).toEqual({ allowed: false, reason: "cellular", preservePage: false });
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
    expect(r).toEqual({ allowed: true, reason: null, preservePage: true });
  });

  it("exige la bannière pendant ad_active (suspension courte, page conservée)", () => {
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
    ).toEqual({ allowed: false, reason: "preparing_ad", preservePage: true });
  });

  it("donne un motif pour chaque état non navigable, avec la bonne valeur de preservePage", () => {
    const expected: Record<string, { reason: BrowseGateReason; preservePage: boolean }> = {
      idle: { reason: "no_session", preservePage: false },
      ad_loading: { reason: "preparing_ad", preservePage: true },
      authorizing_wifi: { reason: "authorizing", preservePage: true },
      paused: { reason: "paused", preservePage: true },
      quota_exhausted: { reason: "quota_exhausted", preservePage: false },
      error: { reason: "error", preservePage: false },
      disconnecting: { reason: "disconnecting", preservePage: true },
    };
    for (const [state, { reason, preservePage }] of Object.entries(expected)) {
      const r = browseGateDecision({
        state: state as ConnectionState,
        bannerPresent: true,
        transport: "wifi",
        requireWifi: true,
      });
      expect(r).toEqual({ allowed: false, reason, preservePage });
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
      "verifying",
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