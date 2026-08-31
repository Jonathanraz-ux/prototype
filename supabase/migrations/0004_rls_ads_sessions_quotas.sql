-- ============================================================
-- 0004_rls_ads_sessions_quotas.sql
-- WiFi Zone — RLS sur publicités, sessions, quotas, notifications,
-- push tokens, audit logs. Inclut la protection anti-fraude.
-- ============================================================

-- ------------------------------------------------------------
-- AD CAMPAIGNS
-- Un client voit uniquement les campagnes actives de son org,
-- visibles dans la fenêtre de diffusion. Il ne peut pas les
-- modifier.
-- ------------------------------------------------------------
alter table public.ad_campaigns enable row level security;

create policy "ad_campaigns_client_select"
  on public.ad_campaigns for select
  using (
    organization_id = public.current_organization_id()
    and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "ad_campaigns_org_admin_all"
  on public.ad_campaigns for all
  using (public.is_organization_admin() and organization_id = public.current_organization_id())
  with check (public.is_organization_admin() and organization_id = public.current_organization_id());

-- ------------------------------------------------------------
-- AD VIEWS
-- Un client enregistre le début (INSERT) mais la récompense et la
-- complétion ne sont accordées QUE par les Edge Functions (grant).
-- Le client ne peut JAMAIS marquer sa propre vue complétée.
-- ------------------------------------------------------------
alter table public.ad_views enable row level security;

-- Insertion initiale autorisée (début de lecture) par l'utilisateur.
create policy "ad_views_self_insert"
  on public.ad_views for insert
  with check (user_id = auth.uid() and reward_granted = false);

-- Lecture par l'utilisateur concerné.
create policy "ad_views_self_select"
  on public.ad_views for select
  using (user_id = auth.uid());

-- Interdiction pour un client de mettre à jour la complétion/récompense.
-- Seules les Edge Functions (service role) modifient reward_granted/completed_at.
create policy "ad_views_no_client_update"
  on public.ad_views for update
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- WIFI SESSIONS
-- Un client NE PEUT PAS créer directement une session 'authorized'
-- ou 'active'. Seule la création d'une session 'pending' (demande)
-- est autorisée depuis l'app. L'autorisation est faite côté serveur.
-- ------------------------------------------------------------
alter table public.wifi_sessions enable row level security;

-- Un utilisateur peut demander une session (status amorti à 'pending').
create policy "wifi_sessions_user_insert_pending"
  on public.wifi_sessions for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- Un utilisateur lit ses propres sessions.
create policy "wifi_sessions_user_select"
  on public.wifi_sessions for select
  using (user_id = auth.uid());

-- Un utilisateur peut uniquement mettre fin à sa propre session en
-- cours (status -> 'disconnected'), pas d'attribution. La restriction
-- sur le statut est appliquée par un trigger (la pseudo-variable NEW
-- n'est pas fiable dans WITH CHECK sur PostgreSQL géré par Supabase).
create policy "wifi_sessions_user_end"
  on public.wifi_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Empêche un utilisateur (non admin) de mettre à jour sa session vers un
-- statut autre que 'disconnected' ou de modifier une session déjà close.
create or replace function public.enforce_wifi_session_user_updates()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() = 'authenticated' and not public.is_organization_admin() then
    if NEW.user_id is distinct from OLD.user_id then
      raise exception 'not allowed to change session user';
    end if;
    if OLD.status in ('expired', 'disconnected', 'failed') then
      raise exception 'session is already closed';
    end if;
    if NEW.status not in ('disconnected') then
      raise exception 'user may only end their own session';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_wifi_session_user_updates
  before update on public.wifi_sessions
  for each row execute function public.enforce_wifi_session_user_updates();

create policy "wifi_sessions_admin_select"
  on public.wifi_sessions for select
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "wifi_sessions_admin_update"
  on public.wifi_sessions for update
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

-- ------------------------------------------------------------
-- QUOTA TRANSACTIONS
-- Un client ne peut JAMAIS s'attribuer un quota. Insertion bloquée
-- depuis l'app ; seules les Edge Functions écrivent.
-- ------------------------------------------------------------
alter table public.quota_transactions enable row level security;

create policy "quota_transactions_read_self"
  on public.quota_transactions for select
  using (user_id = auth.uid());

create policy "quota_transactions_no_client_insert"
  on public.quota_transactions for insert
  with check (false);

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- Un utilisateur lit/marque lu ses propres notifications.
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_user_select"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_user_update_read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- PUSH TOKENS
-- Un utilisateur gère ses propres tokens.
-- ------------------------------------------------------------
alter table public.push_tokens enable row level security;

create policy "push_tokens_user_insert"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

create policy "push_tokens_user_select"
  on public.push_tokens for select
  using (user_id = auth.uid());

create policy "push_tokens_user_delete"
  on public.push_tokens for delete
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- AUDIT LOGS
-- Lecture réservée aux admins. Insertion par défaut via
-- Edge Functions (service role). Jamais modifiables.
-- ------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy "audit_logs_admin_select"
  on public.audit_logs for select
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "audit_logs_no_client_modify"
  on public.audit_logs for all
  using (false)
  with check (false);
