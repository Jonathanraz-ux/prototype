// ============================================================
// _shared/session-machine.test.ts — Tests Deno de la machine
// à états serveur.
// ============================================================

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  ACTIVE_SESSION_STATUSES,
  DISCONNECT_REASONS,
  decideResumeOrClose,
  heartbeatDeadline,
  heartbeatIntervalMs,
  isGraceExpired,
  isSessionActive,
  normalizeReason,
} from "./session-machine.ts";

const GRACE = 25;

Deno.test("machine: la grâce expirée est détectée", () => {
  const now = Date.now();
  assert(!isGraceExpired(now - 1000, now, GRACE));
  assert(!isGraceExpired(now - GRACE * 1000, now, GRACE + 1));
  assert(isGraceExpired(now - 30 * 1000, now, GRACE));
  assert(isGraceExpired(null, now, GRACE));
  assert(isGraceExpired(now - 5000, now, 0));
});

Deno.test("machine: décision reprise / clôture", () => {
  const now = Date.now();
  assertEquals(decideResumeOrClose(now - 1000, now, GRACE), "resume");
  assertEquals(decideResumeOrClose(now - 60 * 1000, now, GRACE), "close_timeout");
  assertEquals(decideResumeOrClose(null, now, GRACE), "close_timeout");
});

Deno.test("machine: heartbeatDeadline = now + grâce", () => {
  const now = 1_700_000_000_000;
  assertEquals(heartbeatDeadline(now, GRACE), now + GRACE * 1000);
});

Deno.test("machine: statuts actifs (accord index unique SQL)", () => {
  assertEquals(ACTIVE_SESSION_STATUSES, [
    "pending",
    "authorizing",
    "authorized",
    "active",
    "paused",
  ]);
  assert(isSessionActive("authorized"));
  assert(isSessionActive("paused"));
  assert(!isSessionActive("disconnected"));
  assert(!isSessionActive("expired"));
});

Deno.test("machine: normalisation des raisons de fin", () => {
  assertEquals(normalizeReason("HEARTBEAT_TIMEOUT"), "HEARTBEAT_TIMEOUT");
  assertEquals(normalizeReason("heartbeat_timeout"), "HEARTBEAT_TIMEOUT");
  assertEquals(normalizeReason("bogus"), "USER_PAUSED_AD");
  assertEquals(normalizeReason(null), "USER_PAUSED_AD");
  assertEquals(normalizeReason(""), "USER_PAUSED_AD");
  for (const r of DISCONNECT_REASONS) {
    assert(DISCONNECT_REASONS.includes(normalizeReason(r)), `${r} doit être normalisé tel quel`);
  }
});

Deno.test("machine: intervalle de battement borné", () => {
  assertEquals(heartbeatIntervalMs(10), 10_000);
  assertEquals(heartbeatIntervalMs(0), 1000);
  assertEquals(heartbeatIntervalMs(-5), 1000);
  assertEquals(heartbeatIntervalMs(1.2), 1000);
});