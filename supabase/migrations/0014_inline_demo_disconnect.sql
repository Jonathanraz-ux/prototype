-- ============================================================
-- 0014_inline_demo_disconnect.sql
-- Bôjô / WiFi Zone — request_demo_wifi_session dissocie le
-- remplacement d'une session démo expirée de end_network_session
-- (réservé au serveur : internal_enforce_service_role).
--
-- Contexte : après la pub validée, l'app appelle request_demo_wifi_session.
-- Si l'utilisateur a déjà une session démo dont le heartbeat est expiré,
-- l'ancien code appelait end_network_session → « Forbidden: operation
-- réservée au serveur » (400) → suspend 'ROUTER_ERROR', accès coupé.
-- En mode démo il n'y a aucun routeur physique : le nettoyage se fait
-- directement (statut disconnected + RAZ auth/ad_state), sans toucher
-- aux fonctions réservées au serveur.
-- ============================================================

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
      -- Session démo expirée : clôture locale (mode démo, aucun routeur.
      -- On n'appelle PAS end_network_session, réservé au serveur).
      update public.wifi_sessions
        set status = 'disconnected',
            ended_at = now(),
            disconnect_reason = 'HEARTBEAT_TIMEOUT',
            ad_state = 'ended',
            authorization_state = 'revoked',
            updated_at = now()
        where id = v_existing.id;
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