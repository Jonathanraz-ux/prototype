// ============================================================
// _shared/agents.ts — Résolution des agents locaux par token.
// L'agent s'authentifie auprès des Edge Functions avec son token :
// seul le HASH (sha256 hex) est stocké en base, jamais le token.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha256Hex } from "./network-commands.ts";

export interface ResolvedAgent {
  id: string;
  organization_id: string;
  site_id: string;
  name: string;
}

export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Retrouve un agent à partir du token porteur (hash comparé aux local_agents). */
export async function resolveAgentByToken(
  supabase: SupabaseClient,
  token: string
): Promise<ResolvedAgent | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase
    .from("local_agents")
    .select("id, organization_id, site_id, name")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    organization_id: data.organization_id,
    site_id: data.site_id,
    name: data.name,
  };
}

/**
 * Secret HMAC de signature des commandes réseau. Longueur minimale 16
 * octets ; null si non configuré (les commandes ne sont alors PAS servies).
 */
export function hmacSecret(): string | null {
  const secret = Deno.env.get("NETWORK_HMAC_SECRET");
  return secret && secret.length >= 16 ? secret : null;
}

/** Lecture d'une variable d'environnement entière strictement positive. */
export function intFromEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}