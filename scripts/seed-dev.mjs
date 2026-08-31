// ============================================================
// scripts/seed-dev.mjs — Seed de développement WiFi Zone
// ============================================================
// Exécute la fonction public.seed_development() POSITIONNÉE pour le
// développement. Ne doit JAMAIS être lancée en pilote/production.
//
// Pré-requis :
//   - Une connexion SQL directe (DATABASE_URL) au projet Supabase.
//     * soit via DATABASE_URL="./..." (connexion directe du pooler)
//     * soit via les variables SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   - Garde de sécurité explicite : exige SEED_DEV=1 (ou --force-dev).
//
// Usage :
//   SEED_DEV=1 DATABASE_URL="postgresql://..." node scripts/seed-dev.mjs
//   SEED_DEV=1 node scripts/seed-dev.mjs --pooler
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const { Client } = pg;

const isForceDev = process.argv.includes("--force-dev");

// ---- Garde de sécurité : environnement explicite ----
if (process.env.SEED_DEV !== "1" && !isForceDev) {
  console.error(
    "\n⛔ Garde de sécurité : ce seed est réservé au développement.\n" +
      "Pour confirmer que vous êtes bien en local, relancez avec SEED_DEV=1\n" +
      "ou l'option --force-dev.\n"
  );
  process.exit(1);
}

const appEnv = process.env.APP_ENV ?? "development";
if (appEnv !== "development") {
  console.error(`\n⛔ APP_ENV='${appEnv}' : seed de développement interdit.\n`);
  process.exit(1);
}

// ---- Résolution de l'URL de connexion ----
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Réutilise l'URL du pooler si le projet est lié via le CLI.
  const poolerFile = join(ROOT, "supabase", ".temp", "pooler-url");
  if (existsSync(poolerFile)) {
    const raw = readFileSync(poolerFile, "utf8").trim();
    if (raw) return raw;
  }

  return null;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "\nℹ️  Aucune DATABASE_URL fournie.\n" +
      "   Renseignez DATABASE_URL (connexion directe ou pooler) pour exécuter le seed.\n"
  );
  process.exit(1);
}

console.log("Seed de développement — connexion à la base...");

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  // Positionne le guard d'environnement pour la session puis exécute le seed.
  await client.query("select set_config('app.seed_env', 'development', false)");
  const res = await client.query("select public.seed_development() as result");

  const result = res.rows[0]?.result;
  console.log(`\n✅ Seed exécuté : ${result ?? "seed_ok"}\n`);
} catch (err) {
  console.error("\n❌ Échec du seed :", err.message ?? err, "\n");
  process.exitCode = 1;
} finally {
  await client.end();
}
