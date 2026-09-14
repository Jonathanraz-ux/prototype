import { describe, it, expect } from "@jest/globals";
import {
  MAX_NATIVE_AUTH_TTL_MS,
  heartbeatTtlMsFromServer,
  watchedSecondsFromDurationMillis,
  resumeQuotaDecision,
} from "../serverAuth";

describe("heartbeatTtlMsFromServer (unités ms / dates serveur)", () => {
  const t0 = "2026-09-09T12:00:00.000Z";

  it("succès : durée = heartbeat_expires_at - server_time, plafonnée", () => {
    const until = new Date(Date.parse(t0) + 25_000).toISOString();
    expect(heartbeatTtlMsFromServer({ server_time: t0, heartbeat_expires_at: until })).toBe(25_000);

    const untilShort = new Date(Date.parse(t0) + 10_000).toISOString();
    expect(heartbeatTtlMsFromServer({ server_time: t0, heartbeat_expires_at: untilShort })).toBe(10_000);

    const far = new Date(Date.parse(t0) + 120_000).toISOString();
    expect(heartbeatTtlMsFromServer({ server_time: t0, heartbeat_expires_at: far })).toBe(MAX_NATIVE_AUTH_TTL_MS);
  });

  it("succès sans server_time : base = last_heartbeat_at", () => {
    const until = new Date(Date.parse(t0) + 12_000).toISOString();
    expect(heartbeatTtlMsFromServer({ last_heartbeat_at: t0, heartbeat_expires_at: until })).toBe(12_000);
  });

  it("expiration : heartbeat déjà échu (≤ base) => 0, jamais de prolongation locale", () => {
    const expired = new Date(Date.parse(t0) - 5_000).toISOString();
    expect(heartbeatTtlMsFromServer({ server_time: t0, heartbeat_expires_at: expired })).toBe(0);
    expect(heartbeatTtlMsFromServer({ server_time: t0, heartbeat_expires_at: t0 })).toBe(0);
  });

  it("renouvellement : chaque battement obtient un TTL vivant, pas de compteur figé", () => {
    let serverNow = Date.parse(t0);
    for (let i = 0; i < 3; i++) {
      serverNow += 10_000;
      const until = new Date(serverNow + 25_000).toISOString();
      const ttl = heartbeatTtlMsFromServer({
        last_heartbeat_at: new Date(serverNow).toISOString(),
        heartbeat_expires_at: until,
      });
      expect(ttl).toBe(25_000);
      expect(ttl).toBeGreaterThan(0);
    }
  });

  it("dates manquantes ou incohérentes → 0 = blocage (aucune autorisation automatique)", () => {
    expect(heartbeatTtlMsFromServer({})).toBe(0);
    expect(heartbeatTtlMsFromServer({ server_time: t0 })).toBe(0);
    expect(heartbeatTtlMsFromServer({ heartbeat_expires_at: t0 })).toBe(0);
    expect(heartbeatTtlMsFromServer({ server_time: "nope", heartbeat_expires_at: "nope" })).toBe(0);
  });
});

describe("watchedSecondsFromDurationMillis (plancher : jamais plus que le réellement regardé)", () => {
  it("52.209 s regardées → 52 s (jamais 53)", () => {
    expect(watchedSecondsFromDurationMillis(52_209)).toBe(52);
  });

  it("5.055 s → 5 s", () => {
    expect(watchedSecondsFromDurationMillis(5_055)).toBe(5);
  });

  it("53 000 ms exacts → 53 s", () => {
    expect(watchedSecondsFromDurationMillis(53_000)).toBe(53);
  });

  it("0 / NaN → 0 (refus 'too_early' côté serveur)", () => {
    expect(watchedSecondsFromDurationMillis(0)).toBe(0);
    expect(watchedSecondsFromDurationMillis(Number.NaN)).toBe(0);
  });
});

describe("resumeQuotaDecision (même quota, source de vérité serveur)", () => {
  it("ok : allocation active avec quota restant strictement positif", () => {
    expect(resumeQuotaDecision({ status: "active", remaining_bytes: 5 * 1024 ** 3 })).toBe("ok");
  });

  it("quota_exhausted : restant 0 ou statut exhausted", () => {
    expect(resumeQuotaDecision({ status: "active", remaining_bytes: 0 })).toBe("quota_exhausted");
    expect(resumeQuotaDecision({ status: "exhausted", remaining_bytes: 0 })).toBe("quota_exhausted");
  });

  it("inactive : allocation absente ou révoquée", () => {
    expect(resumeQuotaDecision(null)).toBe("inactive");
    expect(resumeQuotaDecision(undefined)).toBe("inactive");
    expect(resumeQuotaDecision({ status: "revoked", remaining_bytes: 0 })).toBe("inactive");
  });
});