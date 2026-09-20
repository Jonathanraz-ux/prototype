-- ============================================================
-- 0012_allow_client_demo_session.sql
-- Bôjô / WiFi Zone — Autorise l'APP (jeton utilisateur) à ouvrir
-- une session de démonstration via request_demo_wifi_session.
--
-- Contexte : l'application appelle request_demo_wifi_session
-- directement (sessionRepository.requestDemoWifiSession). Cette
-- fonction passait par ensure_test_allocation, qui exigeait
-- service_role (internal_enforce_service_role). Sur l'appareil,
-- le flux « pub vue → accès » échouait donc en 400 « Forbidden:
-- operation réservée au serveur » juste après le visionnage.
--
-- Change : ensure_test_allocation accepte un drapeau
-- p_self_service. Positionné à true par request_demo_wifi_session,
-- il autorise l'appelant à créer SA PROPRE allocation de
-- démonstration (garde stricte : auth.uid() = p_user_id). Les
-- autres chemins (begin_network_session côté serveur, service_role)
-- conservent l'enforcement service_role par défaut.
-- ============================================================

-- Nouvelle signature (paramètre p_self_service ajouté en dernier,
-- avec défaut false → comportement serveur inchangé). On drop la
-- version 3-arg car l'arité change.
drop function if exists public.ensure_test_allocation(uuid, uuid, bigint);

create or replace function public.ensure_test_allocation(
  p_user_id uuid,
  p_site_id uuid,
  p_quota_bytes bigint default 5368709120,
  p_self_service boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_alloc record;
begin
  if p_self_service then
    -- Chemin démonstration appelé par l'app : uniquement son propre quota.
    if auth.uid() is not null and auth.uid() <> p_user_id then
      raise exception 'Accès non autorisé pour cet utilisateur';
    end if;
  else
    perform public.internal_enforce_service_role();
  end if;

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

grant execute on function public.ensure_test_allocation(uuid, uuid, bigint, boolean) to service_role;

-- ------------------------------------------------------------
-- request_demo_wifi_session : identique à 0010, seule différence :
-- l'allocation de démonstration est créée en self-service afin que
-- l'app (jeton utilisateur) puisse ouvrir la session après la pub.
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

  -- Vérification de l'allocation persistante (5 Go) — self-service :
  -- l'app crée sa propre allocation de démonstration.
  v_alloc := public.ensure_test_allocation(p_user_id, p_site_id, p_quota_bytes, true);

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

grant execute on function public.request_demo_wifi_session(uuid, uuid, uuid, text, integer, bigint) to authenticated, service_role;