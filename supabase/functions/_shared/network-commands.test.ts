// ============================================================
// _shared/network-commands.test.ts — Tests Deno de la signature
// HMAC des commandes réseau et du hachage des tokens.
// ============================================================

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  commandEnvelope,
  signCommand,
  verifyCommand,
  sha256Hex,
  toHex,
  isCommandType,
} from "./network-commands.ts";

const SECRET = "cle-de-test-mercredi";

const INPUT = {
  id: "11111111-2222-3333-4444-555555555555",
  type: "authorize" as const,
  site_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  expires_at: "2026-09-09T09:00:00.000Z",
  payload: JSON.stringify({ session_id: "s-1", site_id: "site-1", grace_seconds: 25 }),
};

Deno.test("sm: enveloppe canonique", () => {
  assertEquals(
    commandEnvelope(INPUT),
    "11111111-2222-3333-4444-555555555555|authorize|aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee|2026-09-09T09:00:00.000Z|" + INPUT.payload
  );
});

Deno.test("sm: signature → vérification (aller-retour)", async () => {
  const sig = await signCommand(SECRET, INPUT);
  assertEquals(sig.length, 64);
  assert(await verifyCommand(SECRET, INPUT, sig));
});

Deno.test("sm: la signature échoue en cas de falsification", async () => {
  const sig = await signCommand(SECRET, INPUT);
  assert(!(await verifyCommand(SECRET, { ...INPUT, payload: '{"session_id":"s-2"}' }, sig)), "payload modifié");
  assert(!(await verifyCommand(SECRET, { ...INPUT, expires_at: "2026-09-09T10:00:00.000Z" }, sig)), "expire modifié");
  assert(!(await verifyCommand(SECRET, { ...INPUT, type: "disconnect" }, sig)), "type modifié");
  assert(!(await verifyCommand("autre-cle", INPUT, sig)), "mauvaise clé");
  assert(!(await verifyCommand(SECRET, INPUT, "deadbeef".repeat(8))), "mauvaise signature");
});

Deno.test("sm: sha256Hex (vecteur connu)", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

Deno.test("sm: toHex", () => {
  assertEquals(toHex(new Uint8Array([0x00, 0x0a, 0xff])), "000aff");
});

Deno.test("sm: isCommandType", () => {
  assert(isCommandType("authorize"));
  assert(isCommandType("collect_usage"));
  assert(!isCommandType("banana"));
});