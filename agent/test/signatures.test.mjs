// ============================================================
// test/signatures.test.mjs — Vérifie que l'implémentation Node des
// signatures est EXACTEMENT celle déployée côté serveur
// (supabase/functions/_shared/network-commands.ts) : même enveloppe
// "id|type|site_id|expires_at|payload", même HMAC-SHA256 hex.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signCommand, verifyCommand, sha256HexOf, commandEnvelope } from "../lib/signatures.mjs";

const SECRET = "JeSuisUnSecretDeTestDiffere-d-Environ16Caractères-v2",
  cmd = {
    id: "3b3b6c03-93be-46c5-bd18-f1b338ab9aee",
    type: "authorize",
    site_id: "9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab",
    expires_at: "2026-06-18T10:00:00.000+00:00",
    payload: JSON.stringify({ session_id: "3b3b6c03-93be-46c5-bd18-f1b338ab9aee", device_observed_ip: "10.0.0.42", grace_seconds: 25 }),
  };

test("enveloppe exacte dans l'ordre id|type|site_id|expires_at|payload", () => {
  assert.equal(
    commandEnvelope(cmd),
    `3b3b6c03-93be-46c5-bd18-f1b338ab9aee|authorize|9e1c2c1e-0e0a-4f2b-8c3e-1234567890ab|${cmd.expires_at}|${cmd.payload}`
  );
});

test("signCommand == HMAC-SHA256(secret, enveloppe) en hex", () => {
  const expected = createHmac("sha256", SECRET).update(commandEnvelope(cmd)).digest("hex");
  assert.equal(signCommand(SECRET, cmd), expected);
  assert.match(signCommand(SECRET, cmd), /^[0-9a-f]{64}$/);
});

test("verifyCommand accepte la bonne signature", () => {
  const sig = signCommand(SECRET, cmd);
  assert.equal(verifyCommand(SECRET, cmd, sig), true);
});

test("verifyCommand rejette signature falsifiée / secret différent", () => {
  const sig = signCommand(SECRET, cmd);
  assert.equal(verifyCommand("autre-secret", cmd, sig), false);
  assert.equal(verifyCommand(SECRET, { ...cmd, payload: '{"p":"nuance"}' }, sig), false);
  assert.equal(verifyCommand(SECRET, cmd, sig.replace(/0/, "1")), false);
});

test("expires_at null devient chaîne vide dans l'enveloppe (miroir serveur)", () => {
  const env = commandEnvelope({ ...cmd, expires_at: null });
  assert.ok(env.includes("|authorize|9e1c2c1e"));
  assert.ok(env.includes("||{"));
});

test("sha256 hex (token d'agent) = 64 caractères hexadécimaux", () => {
  assert.match(sha256HexOf("my-super-secret-token-0"), /^[0-9a-f]{64}$/);
  assert.equal(typeof sha256HexOf("x"), "string");
});