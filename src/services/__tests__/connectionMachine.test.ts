import { describe, it, expect } from "@jest/globals";
import {
  canTransition,
  getDisconnectReason,
  CONNECTION_ACTIONS,
  STATE_LABELS,
  REASON_LABELS,
} from "../connectionMachine";

type S = Parameters<typeof canTransition>[0];

const A = CONNECTION_ACTIONS;

describe("canTransition", () => {
  it("idle → ad_loading (CONNECT)", () => {
    expect(canTransition("idle", A.CONNECT)).toBe("ad_loading");
  });

  it("ad_loading → ad_active (AD_AVAILABLE)", () => {
    expect(canTransition("ad_loading", A.AD_AVAILABLE)).toBe("ad_active");
  });

  it("ad_loading → error (AD_FAILED)", () => {
    expect(canTransition("ad_loading", A.AD_FAILED)).toBe("error");
  });

  it("ad_active → authorizing_wifi (AD_WATCHED)", () => {
    expect(canTransition("ad_active", A.AD_WATCHED)).toBe("authorizing_wifi");
  });

  it("authorizing_wifi → wifi_active (SESSION_AUTHORIZED)", () => {
    expect(canTransition("authorizing_wifi", A.SESSION_AUTHORIZED)).toBe("wifi_active");
  });

  it("wifi_active → paused (PAUSE)", () => {
    expect(canTransition("wifi_active", A.PAUSE)).toBe("paused");
  });

  it("paused → wifi_active (RESUME)", () => {
    expect(canTransition("paused", A.RESUME)).toBe("wifi_active");
  });

  it("wifi_active → disconnecting (DISCONNECT) avec raison USER_PAUSED_AD", () => {
    expect(canTransition("wifi_active", A.DISCONNECT)).toBe("disconnecting");
    expect(getDisconnectReason("wifi_active", A.DISCONNECT)).toBe("USER_PAUSED_AD");
  });

  it("disconnecting → idle (DISCONNECTED) avec raison USER_LOGOUT", () => {
    expect(canTransition("disconnecting", A.DISCONNECTED)).toBe("idle");
    expect(getDisconnectReason("disconnecting", A.DISCONNECTED)).toBe("USER_LOGOUT");
  });

  it("error → idle (DISCONNECTED) avec raison ROUTER_ERROR", () => {
    expect(canTransition("error", A.DISCONNECTED)).toBe("idle");
    expect(getDisconnectReason("error", A.DISCONNECTED)).toBe("ROUTER_ERROR");
  });

  it("quota_exhausted → ad_loading via CONNECT (relance)", () => {
    expect(canTransition("quota_exhausted", A.CONNECT)).toBe("ad_loading");
  });

  it("quota_exhausted → idle via RESET", () => {
    expect(canTransition("quota_exhausted", A.RESET)).toBe("idle");
  });

  it("affectation inconnue renvoie null", () => {
    expect(canTransition("idle" as S, "INCONNUE")).toBeNull();
  });

  it("quasiment toutes les transitions de masse vers RESET rejoint idle", () => {
    const statesToIdle: S[] = [
      "quota_exhausted",
      "error",
      "paused",
      "wifi_active",
      "authorizing_wifi",
      "disconnecting",
      "ad_active",
      "ad_loading",
    ];
    for (const s of statesToIdle) {
      expect(canTransition(s, A.RESET)).toBe("idle");
    }
  });
});

describe("labels", () => {
  it("STATE_LABELS couvre tous les états", () => {
    const expected: S[] = [
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
    for (const s of expected) {
      expect(typeof STATE_LABELS[s]).toBe("string");
    }
  });

  it("REASON_LABELS contient les motifs serveur principaux", () => {
    const reasons = [
      "USER_PAUSED_AD",
      "APP_BACKGROUND",
      "USER_LOGOUT",
      "HEARTBEAT_TIMEOUT",
      "QUOTA_EXHAUSTED",
      "NETWORK_LOST",
      "ADMIN_DISCONNECT",
      "ROUTER_ERROR",
    ];
    for (const r of reasons) {
      expect(typeof REASON_LABELS[r]).toBe("string");
    }
  });
});