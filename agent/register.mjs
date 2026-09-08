// ============================================================
// register.mjs — Helper d'enrôlement : calcule le sha256 hex d'un
// token puis affiche l'INSERT à exécuter côté serveur (éditeur SQL).
// L'agent n'a PAS besoin de tourner pour générer le hash.
//
//   node register.mjs "mon-token-secret"
//
// Puis positionner AGENT_TOKEN sur la MÊME valeur dans agent/.env.
// ============================================================

import { sha256HexOf } from "./lib/signatures.mjs";

const token = process.argv[2];
if (!token) {
  console.error("Usage : node register.mjs \"token-secret\"");
  process.exit(1);
}

const hash = sha256HexOf(token);
console.log("Token           : ************ (jamais réaffiché)");
console.log(`sha256HexOfToken : ${hash}`);
console.log(`
-- À exécuter dans l'éditeur SQL Supabase (service_role) :
INSERT INTO public.local_agents (organization_id, site_id, name, token_hash)
VALUES ('<ORGANIZATION_ID>', '<SITE_ID>', 'agent-mercredi', '${hash}');
`);