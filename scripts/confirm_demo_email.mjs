// ============================================================
// scripts/confirm_demo_email.mjs
// Confirme l'email du compte démo dans Supabase Auth via l'API
// Admin (service_role) — AUCUNE connexion PostgreSQL directe,
// aucun secret en dur.
//
// Usage :
//   SB_SR_PATH="chemin/vers/sb_sr.txt" node scripts/confirm_demo_email.mjs
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DEMO_EMAIL = "demo@wifizone.app";

const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const getEnv = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const URL = getEnv("EXPO_PUBLIC_SUPABASE_URL");
const SR_PATH =
  process.env.SB_SR_PATH || "C:/Users/JONATHAN/AppData/Local/Temp/opencode/sb_sr.txt";
const SERVICE_ROLE = existsSync(SR_PATH) ? readFileSync(SR_PATH, "utf8").trim() : "";

if (!URL || !SERVICE_ROLE) {
  console.error("Clés manquantes (EXPO_PUBLIC_SUPABASE_URL / service_role via SB_SR_PATH).");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function findUserByEmail() {
  const pageSize = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers(page, pageSize);
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (found) return found;
    if (data.users.length < pageSize) return null;
    page += 1;
  }
}

try {
  const user = await findUserByEmail();
  if (!user) {
    console.error(`⚠️  Aucun utilisateur trouvé : ${DEMO_EMAIL}`);
    process.exit(1);
  }
  console.log(`Utilisateur : ${user.email} (id ${user.id})`);
  console.log(`Confirmé avant : ${user.email_confirmed_at ?? "NON"}`);

  const { data, error } = await admin.auth.admin.confirmUser(user.id);
  if (error) throw error;
  console.log("✅ Email confirmé:", JSON.stringify({
    id: data?.user?.id,
    email: data?.user?.email,
    email_confirmed_at: data?.user?.email_confirmed_at,
  }));
} catch (err) {
  console.error("❌ Erreur:", err?.message ?? err);
  process.exitCode = 1;
}