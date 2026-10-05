// ============================================================
// test/config.test.mjs — Validation de la configuration de l'agent.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, loadAgentEnv, formatConfig, resolveRestPort, restPortMismatch } from "../config.mjs";

// `useDotEnv: false` : la suite ne doit dépendre d'aucun .env local
// (le fichier du développeur contient de vrais secrets).
const NO_DOTENV = { useDotEnv: false };
const load = (overrides) => loadAgentEnv(overrides, NO_DOTENV);

test("config minimale invalide sans SUPABASE_URL ni token", () => {
  delete process.env.SUPABASE_URL;
  delete process.env.AGENT_TOKEN;
  const env = load();
  const errors = validateConfig(env);
  assert.ok(errors.some((e) => e.includes("SUPABASE_URL")));
  assert.ok(errors.some((e) => e.includes("AGENT_TOKEN")));
});

test("config mock valide sans routeur ni secret", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-mock-123",
    NETWORK_ADAPTER_TYPE: "mock",
  });
  assert.deepEqual(validateConfig(env), []);
});

test("mode mikrotik exige host + secret HMAC", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "",
    NETWORK_HMAC_SECRET: "",
  });
  const errors = validateConfig(env);
  assert.ok(errors.some((e) => e.includes("MIKROTIK_HOST")));
  assert.ok(errors.some((e) => e.includes("NETWORK_HMAC_SECRET")));
});

test("intervalles invalides rejetés", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_ADAPTER_TYPE: "mock",
    AGENT_FETCH_INTERVAL_MS: "abc",
  });
  assert.ok(validateConfig(env).some((e) => e.includes("AGENT_FETCH_INTERVAL_MS")));
});

test("formatConfig ne révèle jamais les secrets en clair", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-secret",
    NETWORK_HMAC_SECRET: "hs-very-secret",
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "192.168.88.1",
  });
  const formatted = JSON.stringify(formatConfig(env));
  assert.ok(!formatted.includes("tok-secret"));
  assert.ok(!formatted.includes("hs-very-secret"));
  assert.ok(formatted.includes("configuré"));
});

// ---- Ports REST : le piège (TLS=false, port 443) ---------------

test("port REST déduit du TLS quand il n'est pas fourni", () => {
  assert.equal(resolveRestPort({ MIKROTIK_TLS: "false", MIKROTIK_PORT_REST: "" }), 80);
  assert.equal(resolveRestPort({ MIKROTIK_TLS: "true", MIKROTIK_PORT_REST: "" }), 443);
  assert.equal(resolveRestPort({ MIKROTIK_TLS: "false", MIKROTIK_PORT_REST: "8080" }), 8080);
});

test("couple TLS/port incohérent détecté", () => {
  assert.match(restPortMismatch({ MIKROTIK_TLS: "false", MIKROTIK_PORT_REST: "443" }), /port 80/);
  assert.match(restPortMismatch({ MIKROTIK_TLS: "true", MIKROTIK_PORT_REST: "80" }), /443/);
  assert.equal(restPortMismatch({ MIKROTIK_TLS: "false", MIKROTIK_PORT_REST: "80" }), null);
});

test("config mikrotik refuse le couple TLS/port incohérent", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_HMAC_SECRET: "secret-hmac-long-0123456789",
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "192.168.88.1",
    MIKROTIK_USERNAME: "wifi",
    MIKROTIK_PASSWORD: "motdepasse",
    MIKROTIK_TLS: "false",
    MIKROTIK_PORT_REST: "443",
  });
  const errors = validateConfig(env);
  assert.equal(errors.length, 1, `une seule erreur attendue, obtenu : ${errors.join(" | ")}`);
  assert.match(errors[0], /port 80/);
  assert.equal(env.restPort(), 443, "le port explicite reste prioritaire pour le pilote");
});

test("mot de passe et secret laissés à « changez-moi » sont refusés", () => {
  const env = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_HMAC_SECRET: "changez-moi",
    NETWORK_ADAPTER_TYPE: "mikrotik",
    MIKROTIK_HOST: "192.168.88.1",
    MIKROTIK_USERNAME: "wifi",
    MIKROTIK_PASSWORD: "changez-moi",
  });
  const errors = validateConfig(env);
  assert.ok(errors.some((e) => e.includes("MIKROTIK_PASSWORD")));
  assert.ok(errors.some((e) => e.includes("NETWORK_HMAC_SECRET")));
});

test("nom de liste pilotée invalide refusé (injection de règles)", () => {
  const bad = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_ADAPTER_TYPE: "mock",
    WIFI_LIST_NAME: "wz active,drop",
  });
  assert.ok(validateConfig(bad).some((e) => e.includes("WIFI_LIST_NAME")));

  const good = load({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_ADAPTER_TYPE: "mock",
    WIFI_LIST_NAME: "wz-active_2",
  });
  assert.deepEqual(validateConfig(good), []);
});

test("lecture .env : commentaires, guillemets et export tolérés", async () => {
  const { readDotEnv } = await import("../config.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "wz-agent-")), ".env");
  writeFileSync(
    file,
    [
      "# commentaire",
      "SUPABASE_URL=https://x.supabase.co",
      'AGENT_TOKEN="tok-123"',
      "export MIKROTIK_PASSWORD='mot de passe'",
      "ligne=invalide",
      "=sans cle",
    ].join("\n"),
    "utf8"
  );
  const pairs = Object.fromEntries(readDotEnv(file));
  assert.equal(pairs.SUPABASE_URL, "https://x.supabase.co");
  assert.equal(pairs.AGENT_TOKEN, "tok-123");
  assert.equal(pairs.MIKROTIK_PASSWORD, "mot de passe");
  assert.equal(pairs.ligne, "invalide");
  assert.ok(!Object.keys(pairs).includes(""));
});

test("fichier .env absent → lecture silencieuse", async () => {
  const { readDotEnv } = await import("../config.mjs");
  assert.deepEqual(readDotEnv("chemin/inexistant/.env"), []);
});