// ============================================================
// _shared/supabase.ts — Client Supabase côté serveur (service_role)
// ============================================================
// Les Edge Functions disposent automatiquement des variables :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY  (hérité, remplacé éventuellement par
//     SUPABASE_SECRET_KEYS en JSON au fil de la migration des clés)
//   - SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEYS

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function resolveSecretKeys(): string {
  const plural = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (plural) {
    try {
      const parsed = JSON.parse(plural);
      // En mode server, on prend la clé nommée "default" puis la première.
      return parsed["default"] ?? Object.values(parsed)[0] ?? "";
    } catch {
      // clé malformée -> on ignore
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function resolvePublishableKeys(): string {
  const plural = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (plural) {
    try {
      const parsed = JSON.parse(plural);
      return parsed["default"] ?? Object.values(parsed)[0] ?? "";
    } catch {
      // ignore
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

let _service: SupabaseClient | null = null;

/** Client disposant des privilèges serveur (contourne RLS). Réservé au backend. */
export function serviceClient(): SupabaseClient {
  if (_service) return _service;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = resolveSecretKeys();
  _service = createClient(url, key);
  return _service;
}

/** Client utilisant la clé publishable/anon (privilèges RLS normaux).
 *  Si un JWT est fourni, il est attaché comme jeton d'authentification
 *  globaux : les requêtes PostgREST s'exécutent alors sous l'identité
 *  de l'utilisateur (auth.uid() résolu par RLS). */
export function publicClient(token?: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = resolvePublishableKeys();
  return createClient(
    url,
    key,
    token
      ? { global: { headers: { Authorization: `Bearer ${token}` } } }
      : undefined
  );
}
