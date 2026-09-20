// ============================================================
// scripts/setup-demo-account.mjs
// Crée/met à jour le compte démo complet dans Supabase Auth +
// données serveur (organization, site, allocation 5 Go, campagne
// pub, licence) — SANS aucun secret dans le dépôt.
//
// Ce script n'utilise QUE l'API Admin (service_role) via
// supabase-js : il ne touche jamais auth.users en SQL direct et
// ne fait AUCUNE promesse d'écraser le schéma.
//
// Mot de passe : lu depuis le .env (EXPO_PUBLIC_DEMO_PASSWORD),
// identique à celui utilisé par l'auto-login de l'app. La clé
// service_role est lue depuis la variable SB_SR_PATH (sinon le
// fichier temporaire local standard, non commité).
// ============================================================
// Usage :
//   SB_SR_PATH="chemin/vers/sb_sr.txt" node scripts/setup-demo-account.mjs
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DEMO_EMAIL = "demo@wifizone.app";
const DEMO_USER_ID = "d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d";
const DEMO_ORG_ID = DEMO_USER_ID;
const DEMO_SITE_ID = DEMO_USER_ID;
const QUOTA_5GB = 5368709120;

const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const getEnv = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const URL = getEnv("EXPO_PUBLIC_SUPABASE_URL");
const DEMO_PASSWORD = getEnv("EXPO_PUBLIC_DEMO_PASSWORD");
const SITE_ID = getEnv("EXPO_PUBLIC_DEFAULT_SITE_ID");

const SR_PATH =
  process.env.SB_SR_PATH || "C:/Users/JONATHAN/AppData/Local/Temp/opencode/sb_sr.txt";
const SERVICE_ROLE = existsSync(SR_PATH)
  ? readFileSync(SR_PATH, "utf8").trim()
  : "";

if (!URL || !DEMO_PASSWORD || !SERVICE_ROLE) {
  console.error(
    "Clés manquantes (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_DEMO_PASSWORD / service_role via SB_SR_PATH)."
  );
  process.exit(1);
}

if (SITE_ID && SITE_ID !== DEMO_SITE_ID) {
  console.error(
    `Incohérence : EXPO_PUBLIC_DEFAULT_SITE_ID (${SITE_ID}) ≠ site démo (${DEMO_SITE_ID}).`
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function assertOk(label, res) {
  if (res.error) {
    throw new Error(`${label} : ${res.error.message}`);
  }
  return res.data;
}

async function ensureAuthUser() {
  console.log("1. Compte Auth (mot de passe lu depuis .env)...");
  const attrs = {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: "Démo",
      last_name: "Utilisateur",
      full_name: "Démo WiFi Zone",
    },
    app_metadata: { provider: "email", providers: ["email"] },
  };

  let created;
  try {
    created = await admin.auth.admin.createUser(attrs);
    // Le muet d'API Admin (GoTrue) honore l'id : garde-fou si ce n'était pas le cas.
    if (created.data?.user?.id !== DEMO_USER_ID) {
      throw new Error(`id non honoré → ${created.data?.user?.id ?? "?"}`);
    }
  } catch (err) {
    // Seul un compte déjà existant déclenche la resynchronisation. Toute
    // autre erreur (réseau, permissions…) est remontée telle quelle.
    if (!/already|duplicate|exist|email.*taken|registered/i.test(err?.message ?? "")) {
      throw err;
    }
    const updated = await admin.auth.admin.updateUserById(DEMO_USER_ID, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: attrs.user_metadata,
    });
    if (updated.error) throw updated.error;
    await admin.auth.admin.confirmUser(DEMO_USER_ID).catch(() => {});
    console.log("   ✅ Compte existant resynchronisé (mdp + confirmation).");
    return;
  }
  console.log("   ✅ Compte Auth créé", created.data?.user?.id);
}

async function upsertDemoData() {
  console.log("2. Organisation démo...");
  assertOk(
    "organisation",
    await admin
      .from("organizations")
      .upsert(
        {
          id: DEMO_ORG_ID,
          name: "Démo WiFi Zone",
          slug: "demo-wifizone",
          status: "active",
          support_email: DEMO_EMAIL,
        },
        { onConflict: "id" }
      )
  );
  console.log("   ✅ Organisation OK");

  console.log("3. Site démo...");
  assertOk(
    "site",
    await admin
      .from("sites")
      .upsert(
        {
          id: DEMO_SITE_ID,
          organization_id: DEMO_ORG_ID,
          name: "Site Démo",
          address: "12 rue Démo, 75000 Paris",
          timezone: "Europe/Paris",
          status: "active",
        },
        { onConflict: "id" }
      )
  );
  console.log("   ✅ Site OK");

  console.log("4. Allocation 5 Go (idempotente)...");
  const existing = assertOk(
    "allocation existante",
    await admin
      .from("allocations")
      .select("id")
      .eq("user_id", DEMO_USER_ID)
      .eq("site_id", DEMO_SITE_ID)
      .eq("status", "active")
      .maybeSingle()
  );
  if (!existing?.id) {
    assertOk(
      "allocation",
      await admin.from("allocations").insert({
        user_id: DEMO_USER_ID,
        site_id: DEMO_SITE_ID,
        quota_bytes: QUOTA_5GB,
        consumed_bytes: 0,
        status: "active",
      })
    );
    console.log("   ✅ Allocation 5 Go créée");
  } else {
    console.log("   ✅ Allocation existante", existing.id);
  }

  console.log("5. Campagne publicitaire démo...");
  const camp = assertOk(
    "campagne existante",
    await admin
      .from("ad_campaigns")
      .select("id")
      .eq("organization_id", DEMO_ORG_ID)
      .eq("status", "active")
      .maybeSingle()
  );
  if (!camp?.id) {
    assertOk(
      "campagne",
      await admin.from("ad_campaigns").insert({
        organization_id: DEMO_ORG_ID,
        site_id: DEMO_SITE_ID,
        title: "[DÉMO] Publicité de test WiFi Zone",
        advertiser_name: "Partenaire Démo",
        media_url:
          "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        duration_seconds: 15,
        reward_type: "minutes",
        reward_value: 30,
        daily_view_limit: 20,
        status: "active",
      })
    );
    console.log("   ✅ Campagne démo créée");
  } else {
    console.log("   ✅ Campagne existante", camp.id);
  }

  console.log("6. Licence pilote...");
  assertOk(
    "licence",
    await admin.from("licenses").upsert(
      {
        organization_id: DEMO_ORG_ID,
        license_key_hash: "demo-license-key-hash",
        status: "active",
        plan: "pilot",
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 90 * 86400000).toISOString(),
        grace_period_hours: 24,
        max_sites: 5,
        max_routers: 5,
        max_admins: 3,
        features: ["ads", "wifi_sessions", "quota"],
      },
      { onConflict: "license_key_hash" }
    )
  );
  console.log("   ✅ Licence OK");
}

async function finalCheck() {
  console.log("\n═══ Vérification finale ═══");
  const user = await admin.auth.admin.getUserById(DEMO_USER_ID);
  const alloc = assertOk(
    "allocation",
    await admin
      .from("allocations")
      .select("quota_bytes, consumed_bytes, status")
      .eq("user_id", DEMO_USER_ID)
      .eq("status", "active")
      .single()
  );
  const camps = assertOk(
    "campagnes",
    await admin
      .from("ad_campaigns")
      .select("id, title, status")
      .eq("organization_id", DEMO_ORG_ID)
      .eq("status", "active")
  );
  console.log("User:", JSON.stringify(user.error ?? user.data.user?.email ? { id: user.data?.user?.id, email: user.data?.user?.email, confirmed: user.data?.user?.email_confirmed_at != null } : user));
  console.log("Allocation:", JSON.stringify(alloc));
  console.log("Campagnes:", Array.isArray(camps) ? camps.length : 0, "active(s)");
  console.log(`\n✅ Compte démo prêt — email: ${DEMO_EMAIL} / mot de passe: .env (EXPO_PUBLIC_DEMO_PASSWORD)`);
}

try {
  await ensureAuthUser();
  await upsertDemoData();
  await finalCheck();
} catch (err) {
  console.error("\n❌ Erreur:", err?.message ?? err);
  process.exitCode = 1;
}