// ============================================================
// test/config.test.mjs — Validation de la configuration de l'agent.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, loadAgentEnv, formatConfig } from "../config.mjs";

test("config minimale invalide sans SUPABASE_URL ni token", () => {
  delete process.env.SUPABASE_URL;
  delete process.env.AGENT_TOKEN;
  const env = loadAgentEnv();
  const errors = validateConfig(env);
  assert.ok(errors.some((e) => e.includes("SUPABASE_URL")));
  assert.ok(errors.some((e) => e.includes("AGENT_TOKEN")));
});

test("config mock valide sans routeur ni secret", () => {
  const env = loadAgentEnv({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-mock-123",
    NETWORK_ADAPTER_TYPE: "mock",
  });
  assert.deepEqual(validateConfig(env), []);
});

test("mode mikrotik exige host + secret HMAC", () => {
  const env = loadAgentEnv({
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
  const env = loadAgentEnv({
    SUPABASE_URL: "https://example.supabase.co",
    AGENT_TOKEN: "tok-123",
    NETWORK_ADAPTER_TYPE: "mock",
    AGENT_FETCH_INTERVAL_MS: "abc",
  });
  assert.ok(validateConfig(env).some((e) => e.includes("AGENT_FETCH_INTERVAL_MS")));
});

test("formatConfig ne révèle jamais les secrets en clair", () => {
  const env = loadAgentEnv({
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