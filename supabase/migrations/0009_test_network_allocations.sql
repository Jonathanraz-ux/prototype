-- ============================================================
-- 0009_test_network_allocations.sql
-- WiFi Zone — Préparation du test physique MikroTik (mercredi).
--
-- Ajoute le modèle persisté demandé :
--   A. allocations     : 5 Go persistants par utilisateur/site,
--                        consumed_bytes monotone, jamais réinitialisé
--                        à la reconnexion (un seul actif par user/site).
--   B. wifi_sessions   : colonnes heartbeat / bytes / ad & auth state /
--                        session_token / allocation_id.
--   C. network_events  : audit machine (autorisation, heartbeat, pause,
--                        reprise, déconnexion, expiration, quota, erreur).
--   D. local_agents    : identité et santé de l'agent local (notre PC).
--   E. network_commands : file de commandes signées pour l'agent local.
--
-- + Fonctions SQL atomiques (service_role uniquement) :
--   ensure_test_allocation, get_quota_status, begin_network_session,
--   ad_heartbeat_tick, apply_data_usage, end_network_session,
--   expire_stale_network_sessions, enqueue_network_command,
--   record_agent_heartbeat, register_local_agent,
--   admin_reset_allocation, admin_overview_json.
-- ============================================================

-- ------------------------------------------------------------
-- Enumérations
-- ------------------------------------------------------------
-- NOTE : les valeurs 'authorizing' / 'paused' de wifi_session_status sont
-- ajoutées dans la migration 0008_network_enum_values.sql (propre transaction,
-- car impossible d'utiliser une valeur ajoutée par ADD VALUE dans la même
-- transaction qu'un index qui la référence).

create type public.network_event_type as enum (
  'AUTHORIZATION_REQUESTED',
  'AUTHORIZATION_SUCCEEDED',
  'AUTHORIZATION_FAILED',
  'HEARTBEAT',
  'AD_PAUSED',
  'AD_RESUMED',
  'SESSION_DISCONNECTED',
  'HEARTBEAT_EXPIRED',
  'QUOTA_EXHAUSTED',
  'ROUTER_ERROR',
  'ADMIN_RESET_ALLOCATION',
  'AGENT_HEALTH'
);

create type public.network_command_status as enum (
  'pending',
  'claimed',
  'completed',
  'failed',
  'expired',
  'cancelled'
);

create type public.allocation_status as enum (
  'active',
  'exhausted',
  'revoked'
);

create type public.agent_status as enum (
  'registered',
  'online',
  'offline'
);

-- ============================================================
-- A. ALLOCATIONS persistantes
-- ============================================================
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  quota_bytes bigint not null default 5368709120 check (quota_bytes >= 0),
  consumed_bytes bigint not null default 0 check (consumed_bytes >= 0),
  status public.allocation_status not null default 'active',
  created_at timestamptz not null default now(),
  exhausted_at timestamptz,
  updated_at timestamptz not null default now(),
  -- jamais de consommation au-delà du quota
  check (consumed_bytes <= quota_bytes)
);

-- Une seule allocation de test active par utilisateur et par site.
create unique index allocations_active_unique
  on public.allocations (user_id, site_id)
  where status = 'active';

create index allocations_user_idx on public.allocations (user_id);
create index allocations_site_idx on public.allocations (site_id);
create index allocations_active_idx on public.allocations (user_id)
  where status = 'active';

create trigger set_allocations_updated_at
  before update on public.allocations
  for each row execute function public.set_updated_at();

-- ============================================================
-- B. SESSIONS RÉSEAU — colonnes supplémentaires
-- ============================================================
alter table public.wifi_sessions
  add column if not exists allocation_id uuid references public.allocations (id) on delete set null,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists heartbeat_expires_at timestamptz,
  add column if not exists ad_state text not null default 'idle',
  add column if not exists authorization_state text not null default 'none',
  add column if not exists session_token text,
  add column if not exists device_observed_mac text,
  add column if not exists device_observed_ip text,
  add column if not exists router_session_reference text,
  add column if not exists bytes_in bigint not null default 0 check (bytes_in >= 0),
  add column if not exists bytes_out bigint not null default 0 check (bytes_out >= 0),
  add column if not exists bytes_total bigint not null default 0 check (bytes_total >= 0),
  add column if not exists last_bytes_in bigint not null default 0 check (last_bytes_in >= 0),
  add column if not exists last_bytes_out bigint not null default 0 check (last_bytes_out >= 0);

-- Jamais deux sessions réseau actives simultanément pour un utilisateur.
create unique index wifi_sessions_single_active
  on public.wifi_sessions (user_id)
  where status in ('pending', 'authorizing', 'authorized', 'active', 'paused');

create index wifi_sessions_heartbeat_idx on public.wifi_sessions (last_heartbeat_at)
  where status in ('authorized', 'active', 'paused');
create index wifi_sessions_allocation_idx on public.wifi_sessions (allocation_id);

-- ============================================================
-- C. ÉVÉNEMENTS RÉSEAU (audit machine)
-- ============================================================
create table public.network_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  session_id uuid references public.wifi_sessions (id) on delete set null,
  agent_id uuid,
  event_type public.network_event_type not null,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index network_events_session_idx on public.network_events (session_id);
create index network_events_type_idx on public.network_events (event_type, created_at desc);
create index network_events_org_idx on public.network_events (organization_id, created_at desc);

-- ============================================================
-- D. AGENTS LOCAUX (notre PC, à côté du MikroTik)
-- ============================================================
create table public.local_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  status public.agent_status not null default 'registered',
  token_hash text not null unique,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_local_agents_updated_at
  before update on public.local_agents
  for each row execute function public.set_updated_at();

-- ============================================================
-- E. FILE DE COMMANDES RÉSEAU (agent local → MikroTik)
-- ============================================================
create table public.network_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  router_id uuid references public.routers (id) on delete set null,
  session_id uuid references public.wifi_sessions (id) on delete cascade,
  agent_id uuid references public.local_agents (id) on delete set null,
  type text not null check (
    type in ('authorize', 'disconnect', 'collect_usage', 'reconcile', 'walled_garden')
  ),
  status public.network_command_status not null default 'pending',
  -- payload conserve la chaîne JSON EXACTE utilisée pour la signature HMAC.
  payload text not null default '{}',
  requester text not null default 'server',
  signature text,
  expires_at timestamptz,
  attempted_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result jsonb,
  created_at timestamptz not null default now()
);

-- Idempotence : jamais deux commandes 'authorize'/'disconnect' en attente
-- pour la même session.
create unique index network_commands_unique_pending
  on public.network_commands (session_id, type)
  where status = 'pending';

create index network_commands_queue_idx
  on public.network_commands (site_id, status, created_at)
  where status = 'pending';
create index network_commands_status_idx on public.network_commands (status, created_at);

-- ============================================================
-- RLS
-- ============================================================

-- ALLOCATIONS : l'utilisateur lit sa propre allocation ; un admin de
-- l'organisation lit les allocations de ses sites. Aucun client ne peut
-- écrire (quota), jamais.
alter table public.allocations enable row level security;

create policy "allocations_self_select"
  on public.allocations for select
  using (user_id = auth.uid());

create policy "allocations_admin_select"
  on public.allocations for select
  using (
    public.is_organization_admin()
    and exists (
      select 1 from public.sites s
      where s.id = allocations.site_id
        and s.organization_id = public.current_organization_id()
    )
  );

create policy "allocations_no_client_modify"
  on public.allocations for all
  using (false)
  with check (false);

-- NETWORK_EVENTS : lecture admin uniquement, écriture serveur (EF).
alter table public.network_events enable row level security;

create policy "network_events_admin_select"
  on public.network_events for select
  using (
    public.is_organization_admin()
    and exists (
      select 1 from public.sites s
      where s.id = network_events.site_id
        and s.organization_id = public.current_organization_id()
    )
  );

create policy "network_events_no_client_modify"
  on public.network_events for all
  using (false)
  with check (false);

-- LOCAL_AGENTS : lecture admin, écriture serveur.
alter table public.local_agents enable row level security;

create policy "local_agents_admin_select"
  on public.local_agents for select
  using (
    public.is_organization_admin()
    and organization_id = public.current_organization_id()
  );

create policy "local_agents_no_client_modify"
  on public.local_agents for all
  using (false)
  with check (false);

-- NETWORK_COMMANDS : lecture admin, écriture serveur.
alter table public.network_commands enable row level security;

create policy "network_commands_admin_select"
  on public.network_commands for select
  using (
    public.is_organization_admin()
    and organization_id = public.current_organization_id()
  );

create policy "network_commands_no_client_modify"
  on public.network_commands for all
  using (false)
  with check (false);

-- Grants explicites (rôles Postgres ; RLS reste active, service_role la contourne).
grant select on public.allocations, public.network_events, public.local_agents, public.network_commands to authenticated;
grant all on public.allocations, public.network_events, public.local_agents, public.network_commands to service_role;
grant select, update, insert on public.wifi_sessions to service_role;
grant all on public.wifi_sessions to service_role;

-- ============================================================
-- Helpers internes
-- ============================================================

-- Ajoute un événement réseau (serveur uniquement).
create or replace function public.add_network_event(
  p_org_id uuid,
  p_site_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_event_type public.network_event_type,
  p_severity text,
  p_metadata jsonb
) returns void
language sql security definer set search_path = public
as $$
  insert into public.network_events (
    organization_id, site_id, user_id, session_id, event_type, severity, metadata
  ) values (
    p_org_id, p_site_id, p_user_id, p_session_id, p_event_type,
    coalesce(p_severity, 'info'), coalesce(p_metadata, '{}'::jsonb)
  );
$$;

-- Insère une commande réseau signée (idempotent via l'index unique).
create or replace function public.enqueue_network_command(
  p_id uuid,
  p_org_id uuid,
  p_site_id uuid,
  p_router_id uuid,
  p_session_id uuid,
  p_type text,
  p_payload text,
  p_signature text,
  p_expires_at timestamptz,
  p_requester text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.internal_enforce_service_role();

  insert into public.network_commands (
    id, organization_id, site_id, router_id, session_id,
    type, status, payload, requester, signature, expires_at, created_at
  ) values (
    p_id, p_org_id, p_site_id, p_router_id, p_session_id,
    p_type, 'pending', p_payload, coalesce(p_requester, 'server'), p_signature,
    p_expires_at, now()
  )
  on conflict (session_id, type) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.network_commands
      where session_id = p_session_id and type = p_type and status = 'pending'
      limit 1;
  end if;

  return v_id;
end;
$$;

-- ============================================================
-- QUOTA / ALLOCATION
-- ============================================================

-- Garantit l'allocation unique persistante (5 Go par défaut). Ne la
-- réinitialise JAMAIS si elle existe. Retourne l'état complet.
create or replace function public.ensure_test_allocation(
  p_user_id uuid,
  p_site_id uuid,
  p_quota_bytes bigint default 5368709120
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_alloc record;
begin
  perform public.internal_enforce_service_role();
  if p_quota_bytes <= 0 then
    raise exception 'quota_bytes doit être strictement positif';
  end if;

  select organization_id into v_org from public.sites where id = p_site_id;
  if v_org is null then
    raise exception 'site introuvable';
  end if;

  -- Verrou dans l'ordre de lecture pour éviter la double création.
  select * into v_alloc from public.allocations
    where user_id = p_user_id and site_id = p_site_id
    order by created_at asc
    for update;

  if v_alloc.id is null then
    insert into public.allocations (
      user_id, site_id, quota_bytes, consumed_bytes, status
    ) values (
      p_user_id, p_site_id, p_quota_bytes, 0, 'active'
    )
    returning * into v_alloc;

    insert into public.audit_logs (
      organization_id, actor_id, action, resource_type, resource_id, metadata
    ) values (
      v_org, p_user_id, 'ALLOCATION_GRANTED', 'allocation', v_alloc.id::text,
      jsonb_build_object('quota_bytes', p_quota_bytes)
    );

    insert into public.network_events (
      organization_id, site_id, user_id, event_type, severity, metadata
    ) values (
      v_org, p_site_id, p_user_id, 'AUTHORIZATION_REQUESTED', 'info',
      jsonb_build_object(
        'event', 'ALLOCATION_GRANTED',
        'allocation_id', v_alloc.id,
        'quota_bytes', p_quota_bytes
      )
    );
  end if;

  return jsonb_build_object(
    'allocation_id', v_alloc.id,
    'user_id', v_alloc.user_id,
    'site_id', v_alloc.site_id,
    'quota_bytes', v_alloc.quota_bytes,
    'consumed_bytes', v_alloc.consumed_bytes,
    'remaining_bytes', v_alloc.quota_bytes - v_alloc.consumed_bytes,
    'status', v_alloc.status,
    'exhausted_at', v_alloc.exhausted_at
  );
end;
$$;

-- État quota + session active pour l'utilisateur (serveur uniquement).
create or replace function public.get_quota_status(
  p_user_id uuid,
  p_site_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alloc record;
  v_session record;
  v_site_id uuid := coalesce(p_site_id,
    (select site_id from public.devices where user_id = p_user_id order by last_seen_at desc nulls last limit 1));
begin
  perform public.internal_enforce_service_role();

  select * into v_alloc from public.allocations
    where user_id = p_user_id
      and (p_site_id is null or site_id = p_site_id)
    order by created_at desc nulls last
    limit 1;

  select * into v_session from public.wifi_sessions
    where user_id = p_user_id
      and status in ('pending', 'authorizing', 'authorized', 'active', 'paused')
    order by created_at desc
    limit 1;

  return jsonb_build_object(
    'server_time', now(),
    'allocation', case when v_alloc.id is not null then jsonb_build_object(
        'allocation_id', v_alloc.id,
        'user_id', v_alloc.user_id,
        'site_id', v_alloc.site_id,
        'quota_bytes', v_alloc.quota_bytes,
        'consumed_bytes', v_alloc.consumed_bytes,
        'remaining_bytes', v_alloc.quota_bytes - v_alloc.consumed_bytes,
        'status', v_alloc.status,
        'exhausted_at', v_alloc.exhausted_at
      ) else null end,
    'session', case when v_session.id is not null then jsonb_build_object(
        'session_id', v_session.id,
        'site_id', v_session.site_id,
        'router_id', v_session.router_id,
        'status', v_session.status,
        'ad_state', v_session.ad_state,
        'authorization_state', v_session.authorization_state,
        'started_at', v_session.started_at,
        'ended_at', v_session.ended_at,
        'last_heartbeat_at', v_session.last_heartbeat_at,
        'heartbeat_expires_at', v_session.heartbeat_expires_at,
        'bytes_in', v_session.bytes_in,
        'bytes_out', v_session.bytes_out,
        'bytes_total', v_session.bytes_total,
        'disconnect_reason', v_session.disconnect_reason,
        'router_session_reference', v_session.router_session_reference,
        'device_observed_mac', v_session.device_observed_mac,
        'device_observed_ip', v_session.device_observed_ip
      ) else null end
  );
end;
$$;

-- Termine une session réseau (toutes raisons) et enfile la déconnexion
-- côté routeur (idempotent).
create or replace function public.end_network_session(
  p_session_id uuid,
  p_reason text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_sess record;
  v_sig text;
  v_due timestamptz;
  v_updated integer;
begin
  perform public.internal_enforce_service_role();

  select * into v_sess from public.wifi_sessions where id = p_session_id for update;
  if v_sess.id is null then
    return false;
  end if;

  if v_sess.status in ('pending', 'authorizing', 'authorized', 'active') then
    update public.wifi_sessions
      set status = 'disconnected',
          ended_at = now(),
          disconnect_reason = coalesce(p_reason, 'USER_PAUSED_AD'),
          ad_state = case when p_reason in ('USER_PAUSED_AD', 'APP_BACKGROUND', 'NETWORK_LOST')
                          then 'paused' else 'ended' end,
          authorization_state = 'revoked',
          updated_at = now()
      where id = p_session_id
      returning status into v_updated;

    perform public.add_network_event(
      v_sess.organization_id, v_sess.site_id, v_sess.user_id, v_sess.id,
      'SESSION_DISCONNECTED', 'info',
      jsonb_build_object('reason', coalesce(p_reason, 'USER_PAUSED_AD'))
    );

    -- Si le routeur a été touché (référence ou commande authorize), on enfile
    -- la déconnexion (RÉSERVER côté agent).
    if v_sess.router_id is not null then
      v_sig := null;
      v_due := now() + interval '180 seconds';
      perform public.enqueue_network_command(
        gen_random_uuid(), v_sess.organization_id, v_sess.site_id,
        v_sess.router_id, v_sess.id, 'disconnect',
        jsonb_build_object(
          'session_id', v_sess.id,
          'site_id', v_sess.site_id,
          'reason', coalesce(p_reason, 'USER_PAUSED_AD')
        )::text,
        v_sig, v_due, 'server'
      );
    end if;

    return true;
  end if;

  -- Session déjà terminale : rien à faire (idempotent).
  if v_sess.status = 'paused' then
    update public.wifi_sessions
      set status = 'disconnected',
          ended_at = now(),
          disconnect_reason = coalesce(p_reason, 'USER_PAUSED_AD'),
          ad_state = 'paused',
          authorization_state = 'revoked',
          updated_at = now()
      where id = p_session_id;
    return true;
  end if;

  return false;
end;
$$;

-- Déclenche la coupure de quota : allocation épuisée + session coupée.
create or replace function public.exhaust_network_session(
  p_session_id uuid,
  p_allocation_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sess record;
begin
  select * into v_sess from public.wifi_sessions where id = p_session_id;
  if v_sess.id is null then
    return;
  end if;

  update public.allocations
    set status = 'exhausted', exhausted_at = now(), updated_at = now()
    where id = p_allocation_id
      and status = 'active';

  update public.wifi_sessions
    set status = 'disconnected',
        ended_at = now(),
        disconnect_reason = 'QUOTA_EXHAUSTED',
        ad_state = 'ended',
        authorization_state = 'revoked',
        updated_at = now()
    where id = p_session_id
      and status in ('pending', 'authorizing', 'authorized', 'active', 'paused');

  perform public.add_network_event(
    v_sess.organization_id, v_sess.site_id, v_sess.user_id, v_sess.id,
    'QUOTA_EXHAUSTED', 'warning',
    jsonb_build_object('allocation_id', p_allocation_id)
  );

  if v_sess.router_id is not null then
    perform public.enqueue_network_command(
      gen_random_uuid(), v_sess.organization_id, v_sess.site_id,
      v_sess.router_id, v_sess.id, 'disconnect',
      jsonb_build_object(
        'session_id', v_sess.id,
        'site_id', v_sess.site_id,
        'reason', 'QUOTA_EXHAUSTED'
      )::text,
      null, now() + interval '180 seconds', 'server'
    );
  end if;
end;
$$;

-- Comptabilité du trafic réel : SOURCE DE VÉRITÉ = les compteurs du
-- routeur fournis par l'agent (jamais l'application). Le delta depuis la
-- dernière collecte est calculé ici ; le double comptage est impossible
-- (derniers compteurs persistés). Le quota est borné de manière stricte.
create or replace function public.apply_data_usage(
  p_session_id uuid,
  p_bytes_in bigint,
  p_bytes_out bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sess record;
  v_alloc record;
  v_delta_in bigint;
  v_delta_out bigint;
  v_delta bigint;
  v_applied bigint := 0;
  v_exhausted boolean := false;
  v_remaining bigint;
begin
  perform public.internal_enforce_service_role();

  if p_bytes_in < 0 or p_bytes_out < 0 then
    raise exception 'compteurs négatifs rejetés';
  end if;

  select * into v_sess from public.wifi_sessions where id = p_session_id for update;
  if v_sess.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  if v_sess.status not in ('authorized', 'active', 'paused') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_active', 'status', v_sess.status);
  end if;

  -- Delta depuis la dernière mesure (jamais négatif → pas de double compte,
  -- pas de remboursement après redémarrage routeur).
  v_delta_in  := greatest(p_bytes_in  - v_sess.last_bytes_in,  0);
  v_delta_out := greatest(p_bytes_out - v_sess.last_bytes_out, 0);
  v_delta := v_delta_in + v_delta_out;

  update public.wifi_sessions
    set bytes_in = bytes_in + v_delta_in,
        bytes_out = bytes_out + v_delta_out,
        bytes_total = bytes_total + v_delta,
        last_bytes_in = p_bytes_in,
        last_bytes_out = p_bytes_out,
        updated_at = now()
    where id = p_session_id;

  -- Allocation (consommation stricte et bornée).
  if v_sess.allocation_id is not null then
    select * into v_alloc from public.allocations where id = v_sess.allocation_id for update;
    if v_alloc.id is not null then
      v_applied := least(v_delta, v_alloc.quota_bytes - v_alloc.consumed_bytes);
      v_exhausted := (v_alloc.quota_bytes - v_alloc.consumed_bytes - v_applied) <= 0;

      update public.allocations
        set consumed_bytes = consumed_bytes + v_applied,
            updated_at = now()
        where id = v_alloc.id;

      if v_exhausted then
        update public.allocations
          set status = 'exhausted', exhausted_at = now(), updated_at = now()
          where id = v_alloc.id;
      end if;
    end if;
  end if;

  if v_applied > 0 then
    insert into public.quota_transactions (
      organization_id, user_id, device_id, session_id,
      type, seconds_delta, bytes_delta, reason
    ) values (
      v_sess.organization_id, v_sess.user_id, v_sess.device_id, v_sess.id,
      -- Delta négatif : la somme historique des transactions (get_user_quota)
      -- reste une lecture correcte de la consommation.
      'consume', 0, -v_applied, 'router_counters:' || v_sess.id::text
    );
  end if;

  -- Rafraîchit l'allocation après l'écriture pour un retour véridique.
  if v_alloc.id is not null then
    select quota_bytes, consumed_bytes
      into v_alloc.quota_bytes, v_alloc.consumed_bytes
      from public.allocations where id = v_alloc.id;
  end if;

  select quota_bytes - consumed_bytes into v_remaining
    from public.allocations where id = v_alloc.id;

  if v_exhausted then
    perform public.exhaust_network_session(p_session_id, v_alloc.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'delta_in', v_delta_in,
    'delta_out', v_delta_out,
    'delta_bytes', v_delta,
    'applied_bytes', v_applied,
    'quota_bytes', v_alloc.quota_bytes,
    'consumed_bytes', v_alloc.consumed_bytes,
    'remaining_bytes', greatest(v_remaining, 0),
    'exhausted', v_exhausted
  );
end;
$$;

-- Heartbeat publicitaire sécurisé. Le serveur décide seul de l'état.
-- Résultats : ok | no_session | not_active | quota_exhausted.
create or replace function public.ad_heartbeat_tick(
  p_session_id uuid,
  p_grace_seconds integer default 25
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sess record;
  v_alloc record;
  v_remaining bigint;
begin
  perform public.internal_enforce_service_role();

  select * into v_sess from public.wifi_sessions where id = p_session_id for update;
  if v_sess.id is null then
    return jsonb_build_object('outcome', 'no_session');
  end if;

  if v_sess.status not in ('authorized', 'active', 'paused') then
    return jsonb_build_object(
      'outcome', 'not_active',
      'status', v_sess.status,
      'disconnect_reason', v_sess.disconnect_reason
    );
  end if;

  -- Épuisement éventuel vérifié à chaque battement.
  if v_sess.allocation_id is not null then
    select * into v_alloc from public.allocations where id = v_sess.allocation_id;
    if v_alloc.id is not null then
      v_remaining := v_alloc.quota_bytes - v_alloc.consumed_bytes;
      if v_remaining <= 0 or v_alloc.status = 'exhausted' then
        perform public.exhaust_network_session(v_sess.id, v_alloc.id);
        return jsonb_build_object(
          'outcome', 'quota_exhausted',
          'remaining_bytes', greatest(v_remaining, 0),
          'consumed_bytes', v_alloc.consumed_bytes,
          'quota_bytes', v_alloc.quota_bytes
        );
      end if;
    end if;
  end if;

  update public.wifi_sessions
    set last_heartbeat_at = now(),
        heartbeat_expires_at = now() + make_interval(secs => p_grace_seconds),
        ad_state = 'active',
        updated_at = now()
    where id = p_session_id;

  -- Événement heartbeat throttlé (~1/minute) pour éviter le bruit.
  insert into public.network_events (
    organization_id, site_id, user_id, session_id, event_type, severity, metadata
  )
  select v_sess.organization_id, v_sess.site_id, v_sess.user_id, v_sess.id,
         'HEARTBEAT', 'info', jsonb_build_object('grace_seconds', p_grace_seconds)
  where not exists (
    select 1 from public.network_events ne
    where ne.session_id = v_sess.id
      and ne.event_type = 'HEARTBEAT'
      and ne.created_at > now() - interval '55 seconds'
  );

  return jsonb_build_object(
    'outcome', 'ok',
    'session_id', v_sess.id,
    'status', 'active',
    'authorized', true,
    'last_heartbeat_at', now(),
    'heartbeat_expires_at', now() + make_interval(secs => p_grace_seconds),
    'remaining_bytes', coalesce(v_remaining, 0),
    'consumed_bytes', coalesce(v_alloc.consumed_bytes, 0),
    'quota_bytes', coalesce(v_alloc.quota_bytes, 0)
  );
end;
$$;

-- Session réseau : création ET reprise. Jamais de reset d'allocation.
create or replace function public.begin_network_session(
  p_user_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_router_id uuid,
  p_device_id uuid,
  p_session_token text,
  p_device_observed_mac text default null,
  p_device_observed_ip text default null,
  p_grace_seconds integer default 25,
  p_quota_bytes bigint default 5368709120
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing record;
  v_alloc jsonb;
  v_session record;
  v_outcome text := 'created';
begin
  perform public.internal_enforce_service_role();

  -- ---- REPRISE : une session encore fraîche est réutilisée telle quelle.
  select * into v_existing
    from public.wifi_sessions
    where user_id = p_user_id
      and status in ('pending', 'authorizing', 'authorized', 'active', 'paused')
    order by created_at desc
    limit 1
    for update;

  if v_existing.id is not null then
    if v_existing.last_heartbeat_at is null
       or v_existing.last_heartbeat_at > now() - make_interval(secs => p_grace_seconds) then
      v_alloc := public.ensure_test_allocation(p_user_id, v_existing.site_id, p_quota_bytes);
      return jsonb_build_object(
        'outcome', 'resume',
        'session_id', v_existing.id,
        'site_id', v_existing.site_id,
        'router_id', v_existing.router_id,
        'session_token', v_existing.session_token,
        'allocation', v_alloc,
        'status', v_existing.status,
        'ad_state', v_existing.ad_state,
        'authorization_state', v_existing.authorization_state
      );
    else
      -- Session périmée (heartbeat arrêté) : on la clôt avec motif exact.
      perform public.end_network_session(v_existing.id, 'HEARTBEAT_TIMEOUT');
    end if;
  end if;

  -- ---- CRÉATION : allocation persistante unique (jamais remise à zéro).
  v_alloc := public.ensure_test_allocation(p_user_id, p_site_id, p_quota_bytes);

  if (v_alloc->>'status') = 'revoked' or ((v_alloc->>'remaining_bytes')::bigint <= 0) then
    return jsonb_build_object(
      'outcome', 'quota_exhausted',
      'allocation', v_alloc
    );
  end if;

  -- Garde-fou concurrent : l'index unique wifi_sessions_single_active
  -- bloque toute seconde session ; on rejette proprement.
  begin
    insert into public.wifi_sessions (
      organization_id, site_id, router_id, user_id, device_id,
      status, allocated_bytes, ad_state, authorization_state,
      session_token, device_observed_mac, device_observed_ip,
      allocation_id, started_at, last_heartbeat_at, heartbeat_expires_at
    ) values (
      p_organization_id, p_site_id, p_router_id, p_user_id, p_device_id,
      'authorized',
      (v_alloc->>'remaining_bytes')::bigint,
      'idle', 'requested',
      p_session_token, p_device_observed_mac, p_device_observed_ip,
      (v_alloc->>'allocation_id')::uuid,
      now(), now(), now() + make_interval(secs => p_grace_seconds)
    )
    returning * into v_session;
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'session_already_active', 'allocation', v_alloc);
    when null_value_not_allowed then
      return jsonb_build_object('outcome', 'server_error', 'reason', 'missing site/org', 'allocation', v_alloc);
  end;

  -- Autorisation côté routeur via l'agent local (commande signée par l'EF).
  perform public.enqueue_network_command(
    gen_random_uuid(),
    p_organization_id, p_site_id, p_router_id, v_session.id,
    'authorize',
    jsonb_build_object(
      'session_id', v_session.id,
      'site_id', p_site_id,
      'session_token', p_session_token,
      'device_observed_mac', p_device_observed_mac,
      'device_observed_ip', p_device_observed_ip,
      'grace_seconds', p_grace_seconds
    )::text,
    null, now() + interval '120 seconds', 'server'
  );

  perform public.add_network_event(
    p_organization_id, p_site_id, p_user_id, v_session.id,
    'AUTHORIZATION_REQUESTED', 'info',
    jsonb_build_object('session_id', v_session.id, 'router_id', p_router_id)
  );

  return jsonb_build_object(
    'outcome', 'created',
    'session_id', v_session.id,
    'site_id', v_session.site_id,
    'router_id', v_session.router_id,
    'session_token', v_session.session_token,
    'status', v_session.status,
    'allocation', v_alloc,
    'authorization_state', 'requested'
  );
end;
$$;

-- Expiration serveur indépendante de l'application : couvre le crash, le
-- force-stop, le téléphone éteint et la fermeture non coopérative.
-- Retourne le nombre de sessions expirées (l'agent coupe ensuite côté routeur).
create or replace function public.expire_stale_network_sessions(
  p_grace_seconds integer default 25
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_session record;
  v_count integer := 0;
begin
  perform public.internal_enforce_service_role();

  for v_session in
    select * from public.wifi_sessions
    where status in ('authorized', 'active', 'paused')
      and (
        last_heartbeat_at is null
        or last_heartbeat_at < now() - make_interval(secs => p_grace_seconds)
      )
    order by created_at asc
    for update
  loop
    update public.wifi_sessions
      set status = 'disconnected',
          ended_at = now(),
          disconnect_reason = 'HEARTBEAT_TIMEOUT',
          ad_state = 'expired',
          authorization_state = 'revoked',
          updated_at = now()
      where id = v_session.id;

    perform public.add_network_event(
      v_session.organization_id, v_session.site_id, v_session.user_id, v_session.id,
      'HEARTBEAT_EXPIRED', 'warning',
      jsonb_build_object(
        'grace_seconds', p_grace_seconds,
        'last_heartbeat_at', v_session.last_heartbeat_at
      )
    );

    if v_session.router_id is not null then
      perform public.enqueue_network_command(
        gen_random_uuid(), v_session.organization_id, v_session.site_id,
        v_session.router_id, v_session.id, 'disconnect',
        jsonb_build_object(
          'session_id', v_session.id,
          'site_id', v_session.site_id,
          'reason', 'HEARTBEAT_TIMEOUT'
        )::text,
        null, now() + interval '180 seconds', 'server'
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Ancienne fonction de consigne (durée allouée) conservée et complétée
-- par l'expiration des heartbeats.
create or replace function public.expire_stale_sessions()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_a integer;
  v_b integer;
begin
  v_a := 0;
  update public.wifi_sessions
    set status = 'expired',
        ended_at = now(),
        disconnect_reason = 'session_expired'
    where status in ('authorized', 'active')
      and expires_at < now();

  get diagnostics v_a = row_count;

  select public.expire_stale_network_sessions(
    coalesce((select 25), 25)
  ) into v_b;

  return v_a + v_b;
end;
$$;

-- ============================================================
-- AGENTS LOCAUX
-- ============================================================

-- Enregistre / met à jour un agent local. Le HASH (hex sha256) du token
-- est stocké — jamais le token lui-même.
create or replace function public.register_local_agent(
  p_organization_id uuid,
  p_site_id uuid,
  p_name text,
  p_token_hash_hex text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.internal_enforce_service_role();

  insert into public.local_agents (
    organization_id, site_id, name, status, token_hash
  ) values (
    p_organization_id, p_site_id, p_name, 'registered', p_token_hash_hex
  )
  on conflict (token_hash) do update
    set name = excluded.name,
        site_id = excluded.site_id,
        organization_id = excluded.organization_id,
        status = 'registered',
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Heartbeat de l'agent (santé de la chaîne d'orchestration).
create or replace function public.record_agent_heartbeat(
  p_agent_id uuid,
  p_status text,
  p_router_ok boolean default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_site uuid;
  v_router uuid;
  v_result jsonb;
begin
  perform public.internal_enforce_service_role();

  update public.local_agents
    set status = case when p_status = 'online' then 'online' else 'offline' end,
        last_seen_at = now(),
        updated_at = now()
    where id = p_agent_id;

  select site_id into v_site from public.local_agents where id = p_agent_id;

  select id into v_router from public.routers
    where site_id = v_site
    order by created_at asc
    limit 1;

  if v_router is not null then
    update public.routers
      set status = case when coalesce(p_router_ok, false) then 'active' else 'offline' end,
          last_seen_at = now(),
          updated_at = now()
      where id = v_router;
  end if;

  select jsonb_build_object(
    'agent_id', b.id,
    'site_id', b.site_id,
    'name', b.name,
    'status', b.status,
    'last_seen_at', b.last_seen_at
  ) into v_result
    from public.local_agents b
    where b.id = p_agent_id;

  return v_result || jsonb_build_object('router_id', v_router);
end;
$$;

-- ============================================================
-- ADMINISTRATION
-- ============================================================

-- Réinitialisation manuelle d'une allocation (protégée par rôle − vérifié
-- dans l'Edge Function), tracée dans l'audit. N'arrive JAMAIS
-- automatiquement à la reconnexion.
create or replace function public.admin_reset_allocation(
  p_allocation_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alloc record;
begin
  perform public.internal_enforce_service_role();

  select * into v_alloc from public.allocations where id = p_allocation_id for update;
  if v_alloc.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.allocations
    set consumed_bytes = 0,
        status = 'active',
        exhausted_at = null,
        updated_at = now()
    where id = p_allocation_id
    returning * into v_alloc;

  insert into public.audit_logs (
    organization_id, actor_id, action, resource_type, resource_id, metadata
  ) values (
    (select organization_id from public.sites where id = v_alloc.site_id),
    p_actor_id, 'ALLOCATION_RESET', 'allocation', v_alloc.id::text,
    jsonb_build_object(
      'quota_bytes', v_alloc.quota_bytes,
      'consumed_bytes', v_alloc.consumed_bytes,
      'reset_by', p_actor_id
    )
  );

  insert into public.network_events (
    organization_id, site_id, user_id, event_type, severity, metadata
  ) values (
    (select organization_id from public.sites where id = v_alloc.site_id),
    v_alloc.site_id, v_alloc.user_id, 'ADMIN_RESET_ALLOCATION', 'warning',
    jsonb_build_object('allocation_id', v_alloc.id, 'actor_id', p_actor_id)
  );

  return jsonb_build_object(
    'ok', true,
    'allocation_id', v_alloc.id,
    'quota_bytes', v_alloc.quota_bytes,
    'consumed_bytes', v_alloc.consumed_bytes,
    'remaining_bytes', v_alloc.quota_bytes - v_alloc.consumed_bytes,
    'status', v_alloc.status
  );
end;
$$;

-- Vue agrégée d'administration (site d'une organisation).
create or replace function public.admin_overview_json(p_org_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.internal_enforce_service_role();

  select jsonb_build_object(
    'site_id', coalesce((select s.id from public.sites s where s.organization_id = p_org_id order by s.created_at asc limit 1), null),
    'allocations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'allocation_id', a.id,
        'user_id', a.user_id,
        'user_email', (select email from auth.users where id = a.user_id),
        'site_id', a.site_id,
        'quota_bytes', a.quota_bytes,
        'consumed_bytes', a.consumed_bytes,
        'remaining_bytes', a.quota_bytes - a.consumed_bytes,
        'status', a.status,
        'exhausted_at', a.exhausted_at,
        'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
      from public.allocations a
      join public.sites s on s.id = a.site_id
      where s.organization_id = p_org_id
    ),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'session_id', w.id,
        'user_id', w.user_id,
        'site_id', w.site_id,
        'status', w.status,
        'ad_state', w.ad_state,
        'authorization_state', w.authorization_state,
        'started_at', w.started_at,
        'ended_at', w.ended_at,
        'last_heartbeat_at', w.last_heartbeat_at,
        'bytes_in', w.bytes_in,
        'bytes_out', w.bytes_out,
        'bytes_total', w.bytes_total,
        'disconnect_reason', w.disconnect_reason,
        'router_session_reference', w.router_session_reference,
        'device_observed_mac', w.device_observed_mac,
        'device_observed_ip', w.device_observed_ip
      ) order by w.created_at desc), '[]'::jsonb)
      from public.wifi_sessions w
      join public.sites s on s.id = w.site_id
      where s.organization_id = p_org_id
      limit 200
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity,
        'session_id', e.session_id,
        'user_id', e.user_id,
        'metadata', e.metadata,
        'created_at', e.created_at
      ) order by e.created_at desc), '[]'::jsonb)
      from public.network_events e
      join public.sites s on s.id = e.site_id
      where s.organization_id = p_org_id
      limit 100
    ),
    'commands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.type,
        'status', c.status,
        'session_id', c.session_id,
        'created_at', c.created_at,
        'attempted_at', c.attempted_at,
        'completed_at', c.completed_at,
        'error_message', c.error_message
      ) order by c.created_at desc), '[]'::jsonb)
      from public.network_commands c
      where c.organization_id = p_org_id
      limit 50
    ),
    'agents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', la.id,
        'name', la.name,
        'status', la.status,
        'site_id', la.site_id,
        'last_seen_at', la.last_seen_at
      )), '[]'::jsonb)
      from public.local_agents la
      where la.organization_id = p_org_id
    ),
    'routers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'model', r.model,
        'adapter_type', r.adapter_type,
        'status', r.status,
        'site_id', r.site_id,
        'last_seen_at', r.last_seen_at
      )), '[]'::jsonb)
      from public.routers r
      where r.organization_id = p_org_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Grants fonctions serveur (appelées par les Edge Functions).
grant execute on function public.ensure_test_allocation(uuid, uuid, bigint) to service_role;
grant execute on function public.get_quota_status(uuid, uuid) to service_role;
grant execute on function public.begin_network_session(uuid, uuid, uuid, uuid, uuid, text, text, text, integer, bigint) to service_role;
grant execute on function public.ad_heartbeat_tick(uuid, integer) to service_role;
grant execute on function public.apply_data_usage(uuid, bigint, bigint) to service_role;
grant execute on function public.end_network_session(uuid, text) to service_role;
grant execute on function public.expire_stale_network_sessions(integer) to service_role;
grant execute on function public.expire_stale_sessions() to service_role;
grant execute on function public.enqueue_network_command(uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, text) to service_role;
grant execute on function public.register_local_agent(uuid, uuid, text, text) to service_role;
grant execute on function public.record_agent_heartbeat(uuid, text, boolean) to service_role;
grant execute on function public.admin_reset_allocation(uuid, uuid) to service_role;
grant execute on function public.admin_overview_json(uuid) to service_role;
grant execute on function public.add_network_event(uuid, uuid, uuid, uuid, public.network_event_type, text, jsonb) to service_role;
grant execute on function public.exhaust_network_session(uuid, uuid) to service_role;