-- ============================================================
-- 0011_auto_onboard_demo_access.sql
-- Bôjô — Accès démonstration autonome (aucune modification de l'APK).
--
-- Résout le point de blocage à la racine :
--   1. Un compte client auto-inscrit n'a PAS d'organization_id :
--      get-available-campaign → « suspended », start-ad-view → 400
--      no_organization, request_demo_wifi_session → no_organization.
--      → RPC bujo_onboard_org rattache le nouvel utilisateur à
--        l'organisation de démonstration (accès financé par la pub).
--   2. L'identifiant de repli de l'app (« demo-campaign-video ») n'existe
--      PAS dans ad_campaigns → start-ad-view échouait en 404
--      campaign_unavailable et l'accès restait coupé.
--      → une campagne de repli dédiée (is_fallback=true, courte durée)
--        fournit un support valide pour le flux publicitaire en mode démo.
--   3. Les futurs clients inscrits via l'app reçoivent automatiquement
--      l'organisation de démonstration (trigger BEFORE INSERT), puis
--      accèdent au même flux pub → session démo → accès.
-- ============================================================

-- ------------------------------------------------------------
-- Marqueur de campagne de repli (fallback démo)
-- ------------------------------------------------------------
alter table public.ad_campaigns
  add column if not exists is_fallback boolean not null default false;

-- ------------------------------------------------------------
-- Organisation / site de démonstration de référence
-- (slug stable 'demo-wifizone', premier site de cette org).
-- ------------------------------------------------------------
-- Rattachement automatique d'un utilisateur à l'organisation de
-- démonstration. Autorisé pour l'utilisateur lui-même et le rôle
-- serveur uniquement : jamais pour un tiers.
create or replace function public.bujo_onboard_org(
  p_user_id uuid,
  p_org_id uuid default null,
  p_site_id uuid default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_site uuid;
  v_status text;
  v_role public.app_role;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Accès non autorisé pour cet utilisateur';
  end if;

  select id into v_org
    from public.organizations
    where id = coalesce(
      p_org_id,
      (select id from public.organizations where slug = 'demo-wifizone' limit 1)
    )
    limit 1;

  if v_org is null then
    select id into v_org from public.organizations order by created_at asc limit 1;
  end if;

  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'no_organization');
  end if;

  select id into v_site
    from public.sites
    where organization_id = v_org
      and id = coalesce(
        p_site_id,
        (select id from public.sites where organization_id = v_org order by created_at asc limit 1)
      )
    order by created_at asc
    limit 1;

  insert into public.profiles (id, organization_id, status, role, full_name, first_name, email)
  values (
    p_user_id,
    v_org,
    coalesce(p_status, 'active'),
    'user',
    'Utilisateur Bôjô',
    'Utilisateur',
    (select raw_user_meta_data ->> 'email' from auth.users where id = p_user_id)
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        status = excluded.status,
        updated_at = now()
  returning status, role into v_status, v_role;

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_org,
    'site_id', v_site,
    'status', v_status,
    'role', v_role
  );
end;
$$;

grant execute on function public.bujo_onboard_org(uuid, uuid, uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- Auto-inscription des futurs clients : l'organisation de démo est
-- rattachée dès la création du profil par l'utilisateur lui-même.
-- ------------------------------------------------------------
create or replace function public.profiles_auto_onboard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.organization_id is null
     and auth.uid() is not null
     and NEW.id = auth.uid() then
    NEW.organization_id := (
      select id from public.organizations
      where slug = 'demo-wifizone'
      union all
      (select id from public.organizations order by created_at asc limit 1)
      limit 1
    );
  end if;
  if NEW.status is null or NEW.status = '' then
    NEW.status := 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_auto_onboard on public.profiles;
create trigger profiles_auto_onboard
  before insert on public.profiles
  for each row execute function public.profiles_auto_onboard();

-- ------------------------------------------------------------
-- Campagne de repli dédiée (accès financé par la pub, mode démo).
-- Durée courte : le visionnage complet de la pub démo (15 s côté app)
-- dépasse toujours ce seuil → la validation passe (jamais 'too_early').
-- ------------------------------------------------------------
do $$
declare
  v_org uuid;
  v_site uuid;
begin
  select id into v_org from public.organizations
    where slug = 'demo-wifizone' limit 1;
  if v_org is null then
    select id into v_org from public.organizations order by created_at asc limit 1;
  end if;

  if v_org is not null then
    select id into v_site from public.sites
      where organization_id = v_org
      order by created_at asc
      limit 1;

    insert into public.ad_campaigns (
      organization_id, site_id, title, advertiser_name, media_url,
      duration_seconds, reward_type, reward_value, daily_view_limit, status, is_fallback
    )
    select
      v_org, v_site,
      '[BOJO] Accès financé par la publicité',
      'Bôjô',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      4, 'minutes', 30, null, 'active', true
    where not exists (
      select 1 from public.ad_campaigns
      where organization_id = v_org and is_fallback = true
    );
  end if;
end;
$$;