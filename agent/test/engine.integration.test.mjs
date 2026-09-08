// ============================================================
// test/engine.integration.test.mjs — Déroulé de bout en bout SANS
// serveur : le moteur reçoit une commande signée, vérifie la
// signature, agit sur le routeur simulé, puis rapporte le résultat
// (appels serveur simulés in-memory).
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentEngine } from "../engine.mjs";
import { MockRouter } from "../lib/mock-router.mjs";
import { signCommand } from "../lib/signatures.mjs";

const SECRET = "UnSecretDeTestTresLongEtDebileMaisSupA16";
const QUIET = { info() {}, warn() {}, error() {}, debug() {} };

function makeEnv(overrides = {}) {
  return {
    SUPABASE_URL: "http://127.0.0.1:9",
    AGENT_TOKEN: "tok-test",
    NETWORK_HMAC_SECRET: SECRET,
    NETWORK_ADAPTER_TYPE: "mock",
    AGENT_FETCH_INTERVAL_MS: "100000",
    AGENT_PING_INTERVAL_MS: "100000",
    AGENT_COLLECT_INTERVAL_MS: "100000",
    AGENT_EXPIRE_INTERVAL_MS: "100000",
    bool: () => false,
    int: (k) => Number(overrides[k] ?? 100000),
    ...overrides,
  };
}

function fakeServer() {
  const reports = [];
  const collects = [];
  return {
    reports,
    collects,
    call: async (name, body) => {
      if (name === "agent-command-result") {
        reports.push(body);
        return { updated: true };
      }
      if (name === "agent-collect") {
        collects.push(body);
        return { ok: true };
      }
      return {};
    },
  };
}

function signedCommand(c) {
  const cmd = { ...c, signature: "" };
  cmd.signature = signCommand(SECRET, {
    id: cmd.id,
    type: cmd.type,
    site_id: cmd.site_id,
    expires_at: cmd.expires_at ?? "",
    payload: cmd.payload,
  });
  return cmd;
}

test("commande authorize signée → règle sur le routeur → rapport ok", async () => {
  const router = new MockRouter();
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const sessionId = "8f4ac6e2-91d3-4f53-94aa-6f01cbe30479";
  const cmd = signedCommand({
    id: "11111111-2222-3333-4444-555555555555",
    type: "authorize",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    expires_at: "2026-06-18T10:00:00.000+00:00",
    payload: JSON.stringify({
      session_id: sessionId,
      site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
      session_token: "tok-session-1",
      device_observed_ip: "10.0.0.15",
      grace_seconds: 25,
    }),
  });

  await engine.processCommand(cmd);

  const clients = await router.clients();
  assert.equal(clients.length, 1);
  assert.equal(clients[0].address, "10.0.0.15");

  assert.equal(server.reports.length, 1);
  const report = server.reports[0];
  assert.equal(report.ok, true);
  assert.equal(report.session_id, sessionId);
  assert.equal(report.router_session_reference, "mock:10.0.0.15");
  assert.equal(report.router_session_reference, report.result.reference);
});

test("signature invalide → commande refusée, routeur intouché", async () => {
  const router = new MockRouter();
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const cmd = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    type: "disconnect",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    expires_at: null,
    payload: JSON.stringify({ session_id: "x", site_id: "y", reason: "QUOTA_EXHAUSTED" }),
    signature: "deadbeef00".repeat(6) + "deadbeef01".repeat(1),
  };

  await engine.processCommand(cmd);

  assert.equal((await router.clients()).length, 0);
  assert.equal(server.reports.length, 1);
  assert.equal(server.reports[0].ok, false);
  assert.match(server.reports[0].error_message, /Signature/i);
});

test("disconnect signé → retrait de la règle et rapport ok", async () => {
  const router = new MockRouter();
  await router.authorize({ address: "10.0.0.7", comment: "wz:8f4ac6e2" });
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const sessionId = "8f4ac6e2-91d3-4f53-94aa-6f01cbe30479";
  engine.sessions.set(sessionId, { address: "10.0.0.7", comment: "wz:8f4ac6e2" });

  const cmd = signedCommand({
    id: "bbbbbbbb-aaaa-cccc-dddd-eeeeeeeeeeee",
    type: "disconnect",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    expires_at: null,
    payload: JSON.stringify({
      session_id: sessionId,
      site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
      reason: "QUOTA_EXHAUSTED",
    }),
  });

  await engine.processCommand(cmd);

  assert.equal((await router.clients()).length, 0);
  assert.equal(server.reports[0].ok, true);
});

test("collect_usage → tirage des compteurs cumulés puis agent-collect", async () => {
  const router = new MockRouter({ bytesPerSec: 2000 });
  const sessionId = "8f4ac6e2-91d3-4f53-94aa-6f01cbe30479";
  await router.authorize({ address: "10.0.1.2", comment: "wz:8f4ac6e2" });
  router.lastTick = Date.now() - 3000;

  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const cmd = signedCommand({
    id: "cccccccc-dddd-eeee-ffff-000000000001",
    type: "collect_usage",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    expires_at: null,
    payload: JSON.stringify({ session_id: sessionId, device_observed_ip: "10.0.1.2" }),
  });

  await engine.processCommand(cmd);

  assert.equal(server.collects.length, 1);
  const c = server.collects[0];
  assert.equal(c.session_id, sessionId);
  assert.ok(c.bytes_in >= 0 && c.bytes_out >= 0);
  assert.ok(c.bytes_in + c.bytes_out > 4000, "compteurs cumulés >= 3 s de débit");
});