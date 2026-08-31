-- ============================================================
-- 0006_stats_functions.sql
-- WiFi Zone — Fonctions de statistiques pour l'administration.
-- Les statistiques proviennent toutes de la base (jamais fictives).
-- ============================================================

-- ------------------------------------------------------------
-- FONCTION : get_user_quota
-- Calcule le quota restant d'un utilisateur à partir de ses
-- transactions (récompenses accordées - consommation).
-- Accessible avec sécurité ; l'app y fait appel en lecture.
-- ------------------------------------------------------------
create or replace function public.get_user_quota(p_user_id uuid)
returns table (remaining_seconds bigint, remaining_bytes bigint)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(sum(seconds_delta), 0) as remaining_seconds,
    coalesce(sum(bytes_delta), 0) as remaining_bytes
  from public.quota_transactions
  where user_id = p_user_id
    and (seconds_delta <> 0 or bytes_delta <> 0);
$$;

-- Rendre l'appel lisible par l'utilisateur concerné
grant execute on function public.get_user_quota(uuid) to authenticated;

-- ------------------------------------------------------------
-- Stats d'organisation pour l'admin
-- ------------------------------------------------------------
create or replace function public.organization_admin_stats(p_org_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.internal_enforce_service_role();

  select jsonb_build_object(
    'users_registered', (select count(*) from public.profiles where organization_id = p_org_id),
    'active_devices', (select count(*) from public.devices where organization_id = p_org_id and status = 'active'),
    'total_sessions', (select count(*) from public.wifi_sessions where organization_id = p_org_id),
    'active_sessions', (select count(*) from public.wifi_sessions where organization_id = p_org_id and status in ('pending','authorized','active')),
    'ads_started', (select count(*) from public.ad_views where organization_id = p_org_id),
    'ads_completed', (select count(*) from public.ad_views where organization_id = p_org_id and completion_status = 'completed'),
    'completion_rate', (select round(
        (count(*) filter (where completion_status = 'completed'))::numeric
        / nullif(count(*), 0) * 100, 1)
      from public.ad_views where organization_id = p_org_id),
    'rewards_granted', (select count(*) from public.quota_transactions where organization_id = p_org_id and type = 'grant'),
    'avg_watch_seconds', (select round(coalesce(avg(watched_seconds), 0)::numeric, 1)
        from public.ad_views where organization_id = p_org_id and completion_status = 'completed'),
    'consumed_bytes', (select coalesce(sum(consumed_bytes), 0) from public.wifi_sessions where organization_id = p_org_id)
  ) into v_result;

  return v_result;
end;
$$;
