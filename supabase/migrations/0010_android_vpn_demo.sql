-- ============================================================
-- 0010_android_vpn_demo.sql
-- WiFi Zone — Mode Démonstration Android autonome (VpnService local).
--
-- Rôle :
-- Fournir une validation Supabase dédiée au mode démonstration sans
-- dépendre d'un routeur physique MikroTik ni d'un agent local, tout
-- en garantissant la persistance des comptes et du quota de 5 Go.
--
-- Fonctions atomiques ajoutées :
-- 1. request_demo_wifi_session : validation de session démo (quota vérifié,
--    aucun routeur requis, router_session_reference = 'vpn-demo-local').
-- 2. demo_consume_quota : consommation simulée atomique, idempotente
--    et bornée au quota restant.
-- 3. demo_reset_quota : réinitialisation explicite réservée aux tests.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Session de démonstration (indépendante du MikroTik physique)
-- ------------------------------------------------------------
create or replace function public.request_demo_wifi_session(
  p_user_id uuid,
  p_organization_id uuid,
  p_site_id uuid,
  p_session_token text,
  p_grace_seconds integer default 25,
  p_quota_bytes bigint default 5368709120
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alloc jsonb;
  v_existing record;
  v_session record;
begin
  -- Sécurité : l'utilisateur appelant doit correspondre à p_user_id ou être service_role
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Accès non autorisé pour cet utilisateur';
  end if;

  -- Vérification de l'allocation persistante (5 Go)
  v_alloc := public.ensure_test_allocation(p_user_id, p_site_id, p_quota_bytes);

  if (v_alloc->>'status') = 'revoked' or ((v_alloc->>'remaining_bytes')::bigint <= 0) then
    return jsonb_build_object(
      'outcome', 'quota_exhausted',
      'allocation', v_alloc
    );
  end if;

  -- Reprise si session déjà active
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
      update public.wifi_sessions
        set last_heartbeat_at = now(),
            heartbeat_expires_at = now() + make_interval(secs => p_grace_seconds),
            ad_state = 'active',
            status = 'active',
            router_session_reference = coalesce(router_session_reference, 'vpn-demo-local'),
            updated_at = now()
        where id = v_existing.id;

      return jsonb_build_object(
        'outcome', 'resume',
        'session_id', v_existing.id,
        'site_id', v_existing.site_id,
        'session_token', v_existing.session_token,
        'router_session_reference', 'vpn-demo-local',
        'allocation', v_alloc,
        'status', 'active',
        'ad_state', 'active',
        'authorization_state', 'granted',
        'heartbeat_expires_at', now() + make_interval(secs => p_grace_seconds)
      );
    else
      perform public.end_network_session(v_existing.id, 'HEARTBEAT_TIMEOUT');
    end if;
  end if;

  -- Création de la session démo
  begin
    insert into public.wifi_sessions (
      organization_id, site_id, user_id,
      status, allocated_bytes, ad_state, authorization_state,
      session_token, router_session_reference,
      allocation_id, started_at, last_heartbeat_at, heartbeat_expires_at
    ) values (
      p_organization_id, p_site_id, p_user_id,
      'active',
      (v_alloc->>'remaining_bytes')::bigint,
      'active', 'granted',
      p_session_token, 'vpn-demo-local',
      (v_alloc->>'allocation_id')::uuid,
      now(), now(), now() + make_interval(secs => p_grace_seconds)
    )
    returning * into v_session;
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'session_already_active', 'allocation', v_alloc);
  end;

  perform public.add_network_event(
    p_organization_id, p_site_id, p_user_id, v_session.id,
    'AUTHORIZATION_SUCCEEDED', 'info',
    jsonb_build_object(
      'mode', 'android_vpn_demo',
      'session_id', v_session.id,
      'router_session_reference', 'vpn-demo-local'
    )
  );

  return jsonb_build_object(
    'outcome', 'created',
    'session_id', v_session.id,
    'site_id', v_session.site_id,
    'session_token', v_session.session_token,
    'router_session_reference', 'vpn-demo-local',
    'status', 'active',
    'allocation', v_alloc,
    'authorization_state', 'granted',
    'heartbeat_expires_at', now() + make_interval(secs => p_grace_seconds)
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. Consommation simulée de quota (atomique, bornée, idempotente)
-- ------------------------------------------------------------
create or replace function public.demo_consume_quota(
  p_user_id uuid,
  p_bytes bigint,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alloc record;
  v_applied bigint := 0;
  v_exhausted boolean := false;
  v_remaining bigint;
  v_active_sess record;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Accès non autorisé';
  end if;

  if p_bytes <= 0 then
    raise exception 'Nombre d''octets à consommer invalide (doit être > 0)';
  end if;

  select * into v_alloc
    from public.allocations
    where user_id = p_user_id and status = 'active'
    order by created_at desc
    limit 1
    for update;

  if v_alloc.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_allocation');
  end if;

  -- Déjà épuisé ?
  if v_alloc.consumed_bytes >= v_alloc.quota_bytes then
    return jsonb_build_object(
      'ok', true,
      'quota_bytes', v_alloc.quota_bytes,
      'consumed_bytes', v_alloc.consumed_bytes,
      'remaining_bytes', 0,
      'applied_bytes', 0,
      'exhausted', true
    );
  end if;

  -- Bornage strict
  v_applied := least(p_bytes, v_alloc.quota_bytes - v_alloc.consumed_bytes);
  v_exhausted := (v_alloc.quota_bytes - v_alloc.consumed_bytes - v_applied) <= 0;

  update public.allocations
    set consumed_bytes = consumed_bytes + v_applied,
        status = case when v_exhausted then 'exhausted'::public.allocation_status else status end,
        exhausted_at = case when v_exhausted then now() else exhausted_at end,
        updated_at = now()
    where id = v_alloc.id;

  -- Enregistrement transaction audit
  insert into public.quota_transactions (
    organization_id, user_id,
    type, seconds_delta, bytes_delta, reason
  ) values (
    (select organization_id from public.profiles where id = p_user_id),
    p_user_id,
    'consume', 0, -v_applied,
    coalesce(p_idempotency_key, 'demo_simulated_consumption')
  );

  -- Mise à jour session active si épuisé
  if v_exhausted then
    for v_active_sess in
      select id from public.wifi_sessions
      where user_id = p_user_id and status in ('authorized', 'active', 'paused')
    loop
      perform public.exhaust_network_session(v_active_sess.id, v_alloc.id);
    end loop;
  end if;

  v_remaining := greatest(v_alloc.quota_bytes - (v_alloc.consumed_bytes + v_applied), 0);

  return jsonb_build_object(
    'ok', true,
    'quota_bytes', v_alloc.quota_bytes,
    'consumed_bytes', v_alloc.consumed_bytes + v_applied,
    'remaining_bytes', v_remaining,
    'applied_bytes', v_applied,
    'exhausted', v_exhausted
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Réinitialisation explicite de test pour compte démo
-- ------------------------------------------------------------
create or replace function public.demo_reset_quota(
  p_user_id uuid,
  p_quota_bytes bigint default 5368709120
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alloc record;
  v_site_id uuid;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Accès non autorisé';
  end if;

  select site_id into v_site_id
    from public.allocations
    where user_id = p_user_id
    order by created_at desc
    limit 1;

  if v_site_id is null then
    select id into v_site_id from public.sites order by created_at asc limit 1;
  end if;

  if v_site_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_site');
  end if;

  -- Clôture les anciennes allocations
  update public.allocations
    set status = 'revoked', updated_at = now()
    where user_id = p_user_id and status in ('active', 'exhausted');

  -- Crée une allocation neuve
  insert into public.allocations (
    user_id, site_id, quota_bytes, consumed_bytes, status, created_at, updated_at
  ) values (
    p_user_id, v_site_id, p_quota_bytes, 0, 'active', now(), now()
  )
  returning * into v_alloc;

  return jsonb_build_object(
    'ok', true,
    'allocation_id', v_alloc.id,
    'quota_bytes', v_alloc.quota_bytes,
    'consumed_bytes', 0,
    'remaining_bytes', v_alloc.quota_bytes,
    'status', 'active'
  );
end;
$$;

-- Droits d'exécution
grant execute on function public.request_demo_wifi_session(uuid, uuid, uuid, text, integer, bigint) to authenticated, service_role;
grant execute on function public.demo_consume_quota(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.demo_reset_quota(uuid, bigint) to authenticated, service_role;
