-- ============================================================
-- SEED — DONNÉES DE DÉMONSTRATION (DEVELOPPEMENT UNIQUEMENT)
-- ============================================================
-- ⚠️ ATTENTION : Ce fichier contient des données fictives de
-- développement. Il NE DOIT JAMAIS être exécuté automatiquement
-- dans un environnement pilote ou production.
--
-- Protection : le script vérifie une variable d'environnement
-- explicite avant d'agir, sinon il s'arrête immédiatement.
--
-- Exécution réelle (développement uniquement) :
--   node scripts/seed-dev.mjs
-- ============================================================

-- Guard : refuse de fonctionner si l'environnement n'est pas explicitement
-- le développement.
create or replace function public.seed_development()
returns text
language plpgsql
as $$
declare
  v_app_env text;
  v_org_id uuid;
  v_site_id uuid;
  v_router_id uuid;
begin
  -- Le guard d'environnement système doit être positionné.
  v_app_env := current_setting('app.seed_env', true);

  if v_app_env is null or v_app_env <> 'development' then
    raise exception 'Seed de développement interdit dans cet environnement. Positionnez app.seed_env=development si vous êtes vraiment en local.';
  end if;

  -- ------------------------------------------------------------
  -- Organisation de démonstration
  -- ------------------------------------------------------------
  insert into public.organizations (name, slug, status, support_email)
  values ('Démo WiFi Zone', 'demo-wifizone', 'active', 'demo@wifizone.app')
  on conflict (slug) do update set status = 'active'
  returning id into v_org_id;

  -- ------------------------------------------------------------
  -- Licence pilote
  -- ------------------------------------------------------------
  insert into public.licenses (
    organization_id, license_key_hash, status, plan,
    valid_from, valid_until, grace_period_hours,
    max_sites, max_routers, max_admins, features
  )
  values (
    v_org_id, 'demo-license-key-hash', 'active', 'pilot',
    now(), now() + interval '90 days', 24,
    5, 5, 3,
    '["ads","wifi_sessions","quota"]'::jsonb
  )
  on conflict (license_key_hash) do nothing;

  -- ------------------------------------------------------------
  -- Site de démonstration
  -- ------------------------------------------------------------
  insert into public.sites (organization_id, name, address, timezone, status)
  values (v_org_id, 'Site Pilote — Terrasse', '12 rue de la Démo, 75000 Paris', 'Europe/Paris', 'active')
  on conflict do nothing
  returning id into v_site_id;

  -- ------------------------------------------------------------
  -- Routeur de démonstration (adaptateur dev, pas d'équipement réel)
  -- ------------------------------------------------------------
  insert into public.routers (
    organization_id, site_id, name, vendor, model,
    adapter_type, status, configuration_reference
  )
  values (
    v_org_id, v_site_id, 'Routeur Démo', 'MikroTik', 'hAP ac3',
    'development', 'active', 'demo-router-config'
  )
  on conflict do nothing
  returning id into v_router_id;

  -- ------------------------------------------------------------
  -- Campagnes publicitaires de démonstration
  -- ------------------------------------------------------------
  -- Campagne image (30 min)
  insert into public.ad_campaigns (
    organization_id, site_id, title, advertiser_name,
    media_url, thumbnail_url, duration_seconds,
    reward_type, reward_value, daily_view_limit, status
  )
  values (
    v_org_id, v_site_id, 'Découvrez la terrasse', 'Café Demo',
    'https://images.example.com/demo-terrace.jpg',
    'https://images.example.com/demo-terrace-thumb.jpg',
    15, 'minutes', 10, 20, 'active'
  )
  on conflict do nothing;

  -- Campagne vidéo (mixte : minutes + Go)
  insert into public.ad_campaigns (
    organization_id, site_id, title, advertiser_name,
    media_url, thumbnail_url, duration_seconds,
    reward_type, reward_value, daily_view_limit, status
  )
  values (
    v_org_id, v_site_id, 'Vidéo partenaire', 'Partenaire Demo',
    'https://videos.example.com/demo.mp4',
    'https://images.example.com/demo-video-thumb.jpg',
    30, 'mixed', 5, 10, 'active'
  )
  on conflict do nothing;

  return 'seed_ok';
end;
$$;
