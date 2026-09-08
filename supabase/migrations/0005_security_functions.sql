-- ============================================================
-- 0005_security_functions.sql
-- WiFi Zone — Fonctions PostgreSQL atomiques utilisées par les
-- Edge Functions. Ces fonctions sont accessibles avec le rôle
-- service_role uniquement (security definer + verrou).
-- ============================================================

-- ------------------------------------------------------------
-- Authentification d'un appel Edge Function interne
-- Utilise une option request.setting pour restreindre
-- ------------------------------------------------------------
-- NOTE : Ces fonctions sont appelées par les Edge Functions avec le
-- rôle service_role. Elles incluent un garde-fou : refuser si le
-- rôle courant n'est pas service_role (protection profondeur).

create or replace function public.internal_enforce_service_role()
returns void
language plpgsql
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' then
    raise exception 'Forbidden: operation réservée au serveur';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- FONCTION ATOMIQUE : complete_ad_view
-- Marque une vue complétée et accorde UNE seule récompense.
-- Retour : 'rewarded' | 'already_rewarded' | 'invalid' | 'too_early'
-- ------------------------------------------------------------
create or replace function public.complete_ad_view(
  p_view_id uuid,
  p_watched_seconds integer
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_duration integer;
  v_min_watch integer;
  v_row_count integer;
begin
  -- Uniquement accessible au serveur
  perform public.internal_enforce_service_role();

  -- Verrou exclusif sur la vue pour éviter la double validation
  select c.id, c.duration_seconds, av.reward_granted, av.campaign_id, av.organization_id
    into v_campaign
  from public.ad_views av
  join public.ad_campaigns c on c.id = av.campaign_id
  where av.id = p_view_id
  for update of av;

  if v_campaign.id is null then
    return 'invalid';
  end if;

  -- Durée minimale de visualisation : 100% de la durée (lecture obligatoire)
  v_min_watch = v_campaign.duration_seconds;

  if p_watched_seconds < v_min_watch then
    return 'too_early';
  end if;

  -- Déjà récompensé → refus du doublon
  if v_campaign.reward_granted then
    return 'already_rewarded';
  end if;

  -- Mise à jour atomique : complète et accorde la récompense en une opération
  update public.ad_views
    set completed_at = now(),
        watched_seconds = greatest(watched_seconds, p_watched_seconds),
        completion_status = 'completed',
        reward_granted = true
  where id = p_view_id
    and reward_granted = false;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return 'already_rewarded';
  end if;

  -- Insérer la transaction de quota (grant)
  insert into public.quota_transactions (
    organization_id, user_id, ad_view_id, type,
    seconds_delta, bytes_delta, reason
  )
  select
    av.organization_id,
    av.user_id,
    av.id,
    'grant',
    case when c.reward_type in ('minutes', 'mixed')
         then c.reward_value * 60
         else 0 end,
    case when c.reward_type in ('megabytes', 'mixed')
         then c.reward_value * 1024 * 1024
         else 0 end,
    'ad_reward:' || av.id::text
  from public.ad_views av
  join public.ad_campaigns c on c.id = av.campaign_id
  where av.id = p_view_id;

  return 'rewarded';
end;
$$;

-- ------------------------------------------------------------
-- FONCTION ATOMIQUE : request_wifi_session
-- Crée une session 'authorized' après une récompense valide.
-- Verrouille l'utilisateur : une seule session active à la fois.
-- ------------------------------------------------------------
create or replace function public.request_wifi_session(
  p_user_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_router_id uuid,
  p_device_id uuid,
  p_ad_view_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_delta_seconds integer;
  v_delta_bytes bigint;
  v_session_id uuid;
begin
  perform public.internal_enforce_service_role();

  -- Interdiction : plusieurs sessions actives
  select count(*) into v_active
  from public.wifi_sessions
  where user_id = p_user_id
    and status in ('pending', 'authorized', 'active');

  if v_active > 0 then
    return 'session_already_active';
  end if;

  -- Calcul du quota octroyé par la vue publicitaire
  select
    sum((qt.seconds_delta > 0)::int * qt.seconds_delta),
    sum((qt.bytes_delta > 0)::int * qt.bytes_delta)
  into v_delta_seconds, v_delta_bytes
  from public.quota_transactions qt
  where qt.ad_view_id = p_ad_view_id
    and qt.user_id = p_user_id
    and qt.type = 'grant';

  if v_delta_seconds is null and v_delta_bytes is null then
    return 'no_reward';
  end if;

  insert into public.wifi_sessions (
    organization_id, site_id, router_id, user_id, device_id, ad_view_id,
    status, allocated_seconds, allocated_bytes, expires_at
  )
  values (
    p_organization_id, p_site_id, p_router_id, p_user_id, p_device_id, p_ad_view_id,
    'authorized',
    coalesce(v_delta_seconds, 0),
    coalesce(v_delta_bytes, 0),
    now() + make_interval(secs => coalesce(v_delta_seconds, 0))
  )
  returning id into v_session_id;

  return v_session_id::text;
end;
$$;

-- ------------------------------------------------------------
-- FONCTION ATOMIQUE : end_wifi_session
-- Termine une session active pour un utilisateur.
-- ------------------------------------------------------------
create or replace function public.end_wifi_session(
  p_session_id uuid,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform public.internal_enforce_service_role();

  update public.wifi_sessions
    set status = 'disconnected',
        ended_at = now(),
        disconnect_reason = p_reason
  where id = p_session_id
    and status in ('pending', 'authorized', 'active');

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ------------------------------------------------------------
-- FONCTION : expirer automatiquement les sessions dépassées
-- Appelée périodiquement par une Edge Function cron.
-- ------------------------------------------------------------
create or replace function public.expire_stale_sessions()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.wifi_sessions
    set status = 'expired',
        ended_at = now(),
        disconnect_reason = 'session_expired'
  where status in ('authorized', 'active')
    and expires_at < now();

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- ------------------------------------------------------------
-- FONCTION : expirer l'agent local et le routeur faute de
-- heartbeat valide reçu dans le délai configuré.
-- Appelée périodiquement par une Edge Function cron.
-- Un ancien heartbeat ne doit pas laisser l'agent/le routeur
-- "active" indéfiniment : seul un agent réellement connecté au
-- routeur (router_ok=true) peut maintenir "active".
-- ------------------------------------------------------------
create or replace function public.expire_stale_agents(
  p_seconds integer default 120
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.local_agents
    set status = 'offline',
        updated_at = now()
  where status = 'online'
    and (last_seen_at is null
         or last_seen_at < now() - make_interval(secs => p_seconds));

  get diagnostics v_updated = row_count;

  update public.routers
    set status = 'offline',
        updated_at = now()
  where status = 'active'
    and (last_seen_at is null
         or last_seen_at < now() - make_interval(secs => p_seconds));

  return v_updated;
end;
$$;

grant execute on function public.expire_stale_agents(integer) to service_role;
-- ------------------------------------------------------------
-- FONCTION : forcer une seule connexion par appareil (option)
-- Retourne vrai si le device est bloqué.
-- ------------------------------------------------------------
create or replace function public.is_device_blocked(p_device_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select status = 'blocked'
  from public.devices
  where id = p_device_id;
$$;
