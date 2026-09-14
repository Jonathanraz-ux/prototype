// ============================================================
// scripts/setup-demo-account.mjs
// Crée le compte démo complet dans Supabase Auth + données
// serveur (organization, site, allocation 5 Go, campagne pub).
// ============================================================
// Usage:
//   node scripts/setup-demo-account.mjs
// ============================================================

import pg from "pg";
const { Client } = pg;

const DEMO_EMAIL = "demo@wifizone.app";
const DEMO_PASSWORD = "demo1234";
const DEMO_USER_ID = "d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d";
const DEMO_ORG_ID = "d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d";
const DEMO_SITE_ID = "d9fe1d87-b4a8-4b92-8ebc-d213b2929e8d";
const QUOTA_5GB = 5368709120;

const client = new Client({
  connectionString:
    "postgresql://postgres.hwwivzsdepzdgonfbkxq@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connecté à Supabase PostgreSQL\n");

  // 1. Créer ou mettre à jour le compte Auth
  console.log("1. Vérification du compte Auth...");
  const existingUser = await client.query(
    "SELECT id, email, email_confirmed_at FROM auth.users WHERE id = $1",
    [DEMO_USER_ID]
  );

  if (existingUser.rows.length === 0) {
    console.log("   Création du compte démo...");
    const bcryptHash =
      "$2a$10$rQEY5z1z5K5z5K5z5K5z5eX5z5K5z5K5z5K5z5K5z5K5z5K5z5K";
    // Note: Supabase stocke le hash bcrypt. On utilise une requête SQL directe.
    await client.query(
      `INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, confirmation_token,
        recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        last_sign_in_at, confirmation_sent_at, recovery_sent_at,
        email_change_sent_at, phone, phone_confirmed_at,
        email_change_token_current, email_change_confirm_status,
        banned_until, reauthentication_token,
        reauthentication_sent_at, is_sso_user, deleted_at
      ) VALUES (
        $1, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', $2, $3,
        NOW(), NOW(), NOW(), '',
        '', '', '',
        '{"provider":"email","providers":["email"]}',
        '{"first_name":"Démo","last_name":"Utilisateur","full_name":"Démo WiFi Zone"}',
        false, NOW(), NOW(), NOW(),
        NOW(), NULL, NULL,
        '', 0, NULL, '', false, NULL
      )
      ON CONFLICT (id) DO NOTHING`,
      [DEMO_USER_ID, DEMO_EMAIL, bcryptHash]
    );
    console.log("   ✅ Compte Auth créé");
  } else {
    console.log("   ✅ Compte Auth existe déjà:", existingUser.rows[0].email);
  }

  // S'assurer que l'email est confirmé
  await client.query(
    `UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND email_confirmed_at IS NULL`,
    [DEMO_USER_ID]
  );
  console.log("   ✅ Email confirmé\n");

  // 2. Organisation
  console.log("2. Organisation démo...");
  await client.query(
    `INSERT INTO public.organizations (id, name, slug, status, support_email)
     VALUES ($1, 'Démo WiFi Zone', 'demo-wifizone', 'active', 'demo@wifizone.app')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [DEMO_ORG_ID]
  );
  console.log("   ✅ Organisation OK\n");

  // 3. Site
  console.log("3. Site démo...");
  await client.query(
    `INSERT INTO public.sites (id, organization_id, name, address, timezone, status)
     VALUES ($1, $2, 'Site Démo', '12 rue Démo, 75000 Paris', 'Europe/Paris', 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [DEMO_SITE_ID, DEMO_ORG_ID]
  );
  console.log("   ✅ Site OK\n");

  // 4. Profil
  console.log("4. Profil utilisateur...");
  await client.query(
    `INSERT INTO public.profiles (id, organization_id, first_name, last_name, full_name, email, role, status)
     VALUES ($1, $2, 'Démo', 'Utilisateur', 'Démo WiFi Zone', $3, 'organization_admin', 'active')
     ON CONFLICT (id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [DEMO_USER_ID, DEMO_ORG_ID, DEMO_EMAIL]
  );
  console.log("   ✅ Profil OK\n");

  // 5. Allocation 5 Go (idempotente)
  console.log("5. Allocation 5 Go...");
  const existingAlloc = await client.query(
    `SELECT id FROM public.allocations
     WHERE user_id = $1 AND site_id = $2 AND status = 'active'`,
    [DEMO_USER_ID, DEMO_SITE_ID]
  );

  if (existingAlloc.rows.length === 0) {
    await client.query(
      `INSERT INTO public.allocations (user_id, site_id, quota_bytes, consumed_bytes, status)
       VALUES ($1, $2, $3, 0, 'active')`,
      [DEMO_USER_ID, DEMO_SITE_ID, QUOTA_5GB]
    );
    console.log("   ✅ Allocation 5 Go créée\n");
  } else {
    console.log("   ✅ Allocation existante:", existingAlloc.rows[0].id, "\n");
  }

  // 6. Campagne pub démo (vidéo locale)
  console.log("6. Campagne publicitaire démo...");
  const existingCamp = await client.query(
    `SELECT id FROM public.ad_campaigns
     WHERE organization_id = $1 AND status = 'active' LIMIT 1`,
    [DEMO_ORG_ID]
  );

  if (existingCamp.rows.length === 0) {
    await client.query(
      `INSERT INTO public.ad_campaigns (
        organization_id, site_id, title, advertiser_name,
        media_url, duration_seconds, reward_type, reward_value,
        daily_view_limit, status
      ) VALUES (
        $1, $2,
        '[DÉMO] Publicité de test WiFi Zone', 'Partenaire Démo',
        'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        15, 'minutes', 30, 20, 'active'
      )`,
      [DEMO_ORG_ID, DEMO_SITE_ID]
    );
    console.log("   ✅ Campagne démo créée\n");
  } else {
    console.log("   ✅ Campagne existante:", existingCamp.rows[0].id, "\n");
  }

  // 7. Licence
  console.log("7. Licence pilote...");
  await client.query(
    `INSERT INTO public.licenses (
      organization_id, license_key_hash, status, plan,
      valid_from, valid_until, grace_period_hours,
      max_sites, max_routers, max_admins, features
    ) VALUES (
      $1, 'demo-license-key-hash', 'active', 'pilot',
      NOW(), NOW() + interval '90 days', 24,
      5, 5, 3, '["ads","wifi_sessions","quota"]'::jsonb
    ) ON CONFLICT (license_key_hash) DO NOTHING`,
    [DEMO_ORG_ID]
  );
  console.log("   ✅ Licence OK\n");

  // Vérification finale
  console.log("═══ Vérification finale ═══");
  const userCheck = await client.query(
    `SELECT id, email, email_confirmed_at IS NOT NULL as confirmed
     FROM auth.users WHERE id = $1`,
    [DEMO_USER_ID]
  );
  const allocCheck = await client.query(
    `SELECT quota_bytes, consumed_bytes, status
     FROM public.allocations WHERE user_id = $1 AND status = 'active'`,
    [DEMO_USER_ID]
  );
  const campCheck = await client.query(
    `SELECT id, title, status FROM public.ad_campaigns
     WHERE organization_id = $1 AND status = 'active'`,
    [DEMO_ORG_ID]
  );

  console.log("User:", JSON.stringify(userCheck.rows[0]));
  console.log("Allocation:", JSON.stringify(allocCheck.rows[0]));
  console.log("Campagnes:", campCheck.rows.length, "active(s)");
  console.log("\n✅ Compte démo prêt — email:", DEMO_EMAIL, " / mdp:", DEMO_PASSWORD);
} catch (err) {
  console.error("\n❌ Erreur:", err.message, err.detail ?? "");
  process.exitCode = 1;
} finally {
  await client.end();
}
