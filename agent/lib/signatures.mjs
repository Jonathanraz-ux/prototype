// ============================================================
// lib/signatures.mjs — Vérification HMAC + sha256 (miroir Node de
// supabase/functions/_shared/network-commands.ts). L'enveloppe
// signée est : "id|type|site_id|expires_at|payload".
// ============================================================

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export function commandEnvelope(input) {
  return [input.id, input.type, input.site_id, input.expires_at ?? "", input.payload].join("|");
}

/** Vérifie une signature hex HMAC-SHA256 en temps constant. */
export function verifyCommand(secret, input, signature) {
  const expected = createHmac("sha256", secret).update(commandEnvelope(input)).digest("hex");
  const actual = String(signature ?? "");
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  } catch {
    return false;
  }
}

/** Calcule la signature brute en hex (utile pour les tests dérivés). */
export function signCommand(secret, input) {
  return createHmac("sha256", secret).update(commandEnvelope(input)).digest("hex");
}

/** Hash hex sha256 d'un jet quelconque (token d'agent notamment). */
export function sha256HexOf(text) {
  return createHash("sha256").update(String(text ?? "")).digest("hex");
}