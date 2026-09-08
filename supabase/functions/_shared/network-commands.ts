// ============================================================
// _shared/network-commands.ts — Signature HMAC des commandes
// réseau et hachage des tokens d'agents (WebCrypto, 100 % pur).
//
// Enveloppe signée : "id|type|site_id|expires_at|payload".
// La valeur exacte de payload (chaîne JSON canonique stockée en
// base) est préservée — jamais re-sérialisée — pour que la
// signature reste déterministe.
// ============================================================

const enc = new TextEncoder();

export const COMMAND_TYPES = [
  "authorize",
  "disconnect",
  "collect_usage",
  "reconcile",
  "walled_garden",
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export interface NetworkCommandSignatureInput {
  id: string;
  type: CommandType | string;
  site_id: string;
  /** Chaîne ISO exacte stockée en base (timestamptz PostgREST). Rien n'est re-sérialisé. */
  expires_at: string | null;
  /** Chaîne JSON textuelle exacte du champ payload. */
  payload: string;
}

export function commandEnvelope(input: NetworkCommandSignatureInput): string {
  return [input.id, input.type, input.site_id, input.expires_at ?? "", input.payload].join("|");
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), {
    name: "HMAC",
    hash: "SHA-256",
  }, false, ["sign", "verify"]);
}

/** Calcule la signature hex HMAC-SHA256 de l'enveloppe. */
export async function signCommand(
  secret: string,
  input: NetworkCommandSignatureInput
): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(commandEnvelope(input)));
  return toHex(new Uint8Array(sig));
}

/** Vérifie la signature en temps constant. */
export async function verifyCommand(
  secret: string,
  input: NetworkCommandSignatureInput,
  signature: string
): Promise<boolean> {
  try {
    const key = await hmacKey(secret);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(commandEnvelope(input)));
    return timingSafeEqualHex(toHex(new Uint8Array(sig)), signature ?? "");
  } catch {
    return false;
  }
}

/** Hache hex SHA-256 (utilisé pour stocker le hash du token d'agent, jamais le token). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return toHex(new Uint8Array(digest));
}

export function isCommandType(value: string): value is CommandType {
  return (COMMAND_TYPES as readonly string[]).includes(value);
}