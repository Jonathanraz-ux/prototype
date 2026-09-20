-- ============================================================
-- 0013_fix_demo_allocation_reuse.sql
-- Bôjô / WiFi Zone — En self-service (chemin de démonstration),
-- une allocation non-active (revoked/exhausted) trouvée en base
-- ne doit PLUS bloquer le flux : l'app ouvre une allocation neuve
-- et active. La session démo passe ainsi même après un reset.
--
-- Contexte : request_demo_wifi_session → ensure_test_allocation
-- réutilisait la dernière allocation du couple (user, site), quel
-- que soit son statut. Une allocation 'revoked' (reset démo déjà
-- effectué) renvoyait quota_exhausted et l'accès restait coupé
-- APRES le visionnage de la publicité (suspend 'quota_exhausted').
-- ============================================================

-- Réutilise une allocation active pour le chemin service_role
-- (comportement serveur inchangé). Pour le chemin self-service
-- (app, démo), on ignore les allocations révoquées/épuisées.
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
  -- En self-service, on ne réutilise QUE les allocations actives :
  -- revoked/exhausted → l'insertion ci-dessous crée une allocation neuve.
  if p_self_service then
    select * into v_alloc from public.allocations
      where user_id = p_user_id and site_id = p_site_id and status = 'active'
      order by created_at asc
      for update;
  else
    select * into v_alloc from public.allocations
      where user_id = p_user_id and site_id = p_site_id
      order by created_at asc
      for update;
  end if;

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