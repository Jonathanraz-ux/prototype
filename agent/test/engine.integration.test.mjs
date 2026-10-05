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
  await router.ensureQueue({ address: "10.0.1.2", comment: "wz:8f4ac6e2" });
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

// ---- Contrat de comptage (l'argent des abonnés) -----------------

test("authorize crée la file de comptage — sans elle l'accès n'est pas mesuré", async () => {
  const router = new MockRouter();
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const sessionId = "11111111-2222-3333-4444-555555555555";
  const cmd = signedCommand({
    id: "dddddddd-dddd-eeee-ffff-000000000002",
    type: "authorize",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    payload: JSON.stringify({ session_id: sessionId, device_observed_ip: "10.0.0.21" }),
  });

  await engine.processCommand(cmd);

  assert.equal(server.reports[0].ok, true);
  assert.ok(router.queues.has("10.0.0.21"), "la file doit exister pour que le quota se décompte");
  assert.equal(router.queues.get("10.0.0.21"), "bojo-10.0.0.21-11111111");
  // la session est mémorisée pour la collecte
  assert.equal(engine.sessions.get(sessionId).address, "10.0.0.21");
});

test("file de comptage indisponible → autorisation REFUSÉE et routeur nettoyé", async () => {
  const router = new MockRouter();
  router.ensureQueue = async () => {
    throw new Error("RouterOS REST POST /queue/simple → 403: not allowed");
  };
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  const cmd = signedCommand({
    id: "eeeeeeee-eeee-ffff-0000-000000000003",
    type: "authorize",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    payload: JSON.stringify({
      session_id: "22222222-2222-3333-4444-555555555555",
      device_observed_ip: "10.0.0.22",
    }),
  });

  await engine.processCommand(cmd);

  assert.equal(server.reports[0].ok, false, "un accès non mesuré ne doit jamais être accordé");
  assert.match(server.reports[0].error_message, /comptage|file/i);
  // aucune autorisation résiduelle : le client ne doit pas garder le WiFi
  assert.equal((await router.clients()).length, 0, "entrée de liste retirée");
  assert.equal(router.queues.has("10.0.0.22"), false);
});

test("disconnect supprime la file de comptage (pas de file orpheline)", async () => {
  const router = new MockRouter();
  const sessionId = "33333333-3333-3333-4444-555555555555";
  await router.authorize({ address: "10.0.0.23", comment: "wz:33333333" });
  await router.ensureQueue({ address: "10.0.0.23", comment: "wz:33333333" });
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;
  engine.sessions.set(sessionId, { address: "10.0.0.23", comment: "wz:33333333" });

  const cmd = signedCommand({
    id: "ffffffff-ffff-0000-1111-000000000004",
    type: "disconnect",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    payload: JSON.stringify({ session_id: sessionId, reason: "USER_LOGOUT" }),
  });

  await engine.processCommand(cmd);

  assert.equal(server.reports[0].ok, true);
  assert.equal((await router.clients()).length, 0);
  assert.equal(router.queues.has("10.0.0.23"), false, "file supprimée à la déconnexion");
});

test("file disparue (redémarrage du routeur) → recréée à la collecte suivante", async () => {
  const router = new MockRouter();
  const sessionId = "44444444-4444-4444-4444-555555555555";
  await router.authorize({ address: "10.0.0.24", comment: "wz:44444444" });
  await router.ensureQueue({ address: "10.0.0.24", comment: "wz:44444444" });
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;
  engine.sessions.set(sessionId, { address: "10.0.0.24", comment: "wz:44444444" });

  // le routeur redémarre : la file simple disparaît
  router.queues.clear();

  const usage = await engine.measure("10.0.0.24", "wz:44444444");
  assert.ok(usage, "la mesure doit aboutir");
  assert.ok(router.queues.has("10.0.0.24"), "la file est recréée : le comptage ne doit pas s'arrêter");
});

test("walled_garden : résultat EXPLICITE non implémenté (jamais de faux succès)", async () => {
  const router = new MockRouter();
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const res = await engine.handleWalledGarden({ list: ["exemple.com"] });
  assert.equal(res.ok, true);
  assert.equal(res.result.implemented, false, "le serveur doit savoir que ce n'est pas actif");
  assert.equal(res.result.list, "wz-active");
  assert.equal((await router.clients()).length, 0, "aucune écriture parasite");
});
// ---- Retraits incomplets : le retour arrière doit etre complet ----

test("authorize : ensureQueue en échec ne laisse NI file NI accès", async () => {
  const router = new MockRouter();
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  const server = fakeServer();
  engine.call = server.call;

  // Le routeur accepte l'entrée de liste puis refuse la file.
  const realEnsure = router.ensureQueue.bind(router);
  router.ensureQueue = async () => {
    // La file est réellement créée AVANT l'échec (cas RouterOS réel :
    // la création passe, la lecture/validation qui suit échoue).
    await realEnsure({ address: "10.0.0.31", comment: "wz:aaaa" });
    throw new Error("file simple refusée par le routeur");
  };

  const res = await engine.handleAuthorize("55555555-5555-5555-5555-555555555555", {
    device_observed_ip: "10.0.0.31",
  });

  assert.equal(res.ok, false, "aucun accès sans file");
  assert.match(res.error_message, /file de comptage/);
  assert.equal(router.queues.has("10.0.0.31"), false, "file fantôme supprimée");
  assert.equal((await router.clients()).length, 0, "entrée de liste retirée aussi");
});

test("disconnect : la file part meme si la revocation d'acces echoue", async () => {
  const router = new MockRouter();
  const sessionId = "66666666-6666-6666-6666-666666666666";
  await router.authorize({ address: "10.0.0.41", comment: "wz:66666666" });
  await router.ensureQueue({ address: "10.0.0.41", comment: "wz:66666666" });
  const engine = new AgentEngine({ env: makeEnv(), router, log: QUIET });
  engine.sessions.set(sessionId, { address: "10.0.0.41", comment: "wz:66666666" });

  router.deauthorize = async () => {
    throw new Error("address-list en lecture seule");
  };

  const res = await engine.handleDisconnect(sessionId, { reason: "QUOTA" });

  assert.equal(res.ok, false, "l'echec de revocation est remonte");
  assert.match(res.error_message, /partielle/);
  assert.equal(router.queues.has("10.0.0.41"), false, "la file doit partir malgre l'echec");
  assert.equal(engine.sessions.has(sessionId), false, "session oubliee");
});
