-- ============================================================
-- 0002_ads_and_sessions.sql
-- WiFi Zone — Publicités, sessions Wi-Fi, quotas, notifications
-- ============================================================

-- ------------------------------------------------------------
-- Ad campaigns
-- ------------------------------------------------------------
create type public.ad_campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type public.reward_type as enum ('minutes', 'megabytes', 'mixed');

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null, -- null = campagne globale
  title text not null,
  advertiser_name text not null,
  media_url text not null,
  thumbnail_url text,
  duration_seconds integer not null default 15,
  reward_type public.reward_type not null default 'minutes',
  reward_value integer not null default 30,
  daily_view_limit integer,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.ad_campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_campaigns_organization_idx on public.ad_campaigns (organization_id);
create index ad_campaigns_status_idx on public.ad_campaigns (organization_id, status);

-- ------------------------------------------------------------
-- Ad views
-- ------------------------------------------------------------
create type public.ad_completion_status as enum ('completed', 'abandoned', 'invalidated');

create table public.ad_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  watched_seconds integer not null default 0,
  completion_status public.ad_completion_status not null default 'abandoned',
  proof_nonce text not null unique,
  reward_granted boolean not null default false,
  created_at timestamptz not null default now()
);

create index ad_views_user_idx on public.ad_views (user_id);
create index ad_views_campaign_idx on public.ad_views (campaign_id);
create index ad_views_nonce_idx on public.ad_views (proof_nonce);
create index ad_views_org_idx on public.ad_views (organization_id);

-- ------------------------------------------------------------
-- Wifi sessions
-- ------------------------------------------------------------
create type public.wifi_session_status as enum (
  'pending', 'authorized', 'active', 'expired', 'disconnected', 'failed'
);

create table public.wifi_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  router_id uuid references public.routers (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  ad_view_id uuid references public.ad_views (id) on delete set null,
  status public.wifi_session_status not null default 'pending',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  ended_at timestamptz,
  allocated_seconds integer not null default 0,
  allocated_bytes bigint not null default 0,
  consumed_seconds integer,
  consumed_bytes bigint,
  network_session_reference text,
  disconnect_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wifi_sessions_user_idx on public.wifi_sessions (user_id);
create index wifi_sessions_org_idx on public.wifi_sessions (organization_id);
create index wifi_sessions_status_idx on public.wifi_sessions (status);
create index wifi_sessions_active_idx on public.wifi_sessions (user_id)
  where status in ('pending', 'authorized', 'active');

-- ------------------------------------------------------------
-- Quota transactions
-- ------------------------------------------------------------
create type public.quota_transaction_type as enum ('grant', 'consume', 'refund', 'adjustment');

create table public.quota_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  session_id uuid references public.wifi_sessions (id) on delete set null,
  ad_view_id uuid references public.ad_views (id) on delete set null,
  type public.quota_transaction_type not null,
  seconds_delta integer not null default 0,
  bytes_delta bigint not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

create index quota_transactions_user_idx on public.quota_transactions (user_id);
create index quota_transactions_adview_idx on public.quota_transactions (ad_view_id);

-- ------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------
create type public.notification_type as enum ('promotion', 'maintenance', 'quota', 'system');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  type public.notification_type not null default 'system',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at);

-- ------------------------------------------------------------
-- Push tokens
-- ------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  device_id uuid references public.devices (id) on delete set null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Audit logs
-- ------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs (organization_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

-- Trigger updates
create trigger set_ad_campaigns_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

create trigger set_wifi_sessions_updated_at
  before update on public.wifi_sessions
  for each row execute function public.set_updated_at();

create trigger set_push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();
