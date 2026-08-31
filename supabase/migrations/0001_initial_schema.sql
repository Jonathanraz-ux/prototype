-- ============================================================
-- 0001_initial_schema.sql
-- WiFi Zone — Schéma de base : rôles, organisations, profils,
-- appareils, sites, routeurs, licences
-- ============================================================
-- Ce fichier est le schéma de référence. Il est versionné et doit
-- être appliqué sur chaque environnement via `supabase db push`.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Rôles applicatifs
-- ------------------------------------------------------------
create type public.app_role as enum (
  'user',
  'site_manager',
  'organization_admin',
  'super_admin'
);

create type public.organization_status as enum (
  'active',
  'suspended',
  'onboarding'
);

-- ------------------------------------------------------------
-- Organizations
-- ------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.organization_status not null default 'onboarding',
  logo_url text,
  support_phone text,
  support_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Profiles (lié à auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  full_name text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  email text,
  role public.app_role not null default 'user',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_idx on public.profiles (organization_id);
create index profiles_role_idx on public.profiles (role);

-- ------------------------------------------------------------
-- Licenses (contrôlées par Noctis Digital Forge)
-- ------------------------------------------------------------
create type public.license_status as enum (
  'pilot',
  'active',
  'suspended',
  'expired',
  'revoked'
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  license_key_hash text not null unique,
  status public.license_status not null default 'pilot',
  plan text not null default 'pilot',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  grace_period_hours integer not null default 0,
  max_sites integer not null default 1,
  max_routers integer not null default 1,
  max_admins integer not null default 1,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index licenses_organization_idx on public.licenses (organization_id);

-- ------------------------------------------------------------
-- Sites
-- ------------------------------------------------------------
create type public.site_status as enum ('active', 'inactive', 'maintenance');

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text,
  timezone text not null default 'UTC',
  status public.site_status not null default 'inactive',
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sites_organization_idx on public.sites (organization_id);

-- ------------------------------------------------------------
-- Routers
-- ------------------------------------------------------------
create type public.router_status as enum ('active', 'inactive', 'offline', 'maintenance');
create type public.adapter_type as enum ('radius', 'mikrotik', 'development');

create table public.routers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  name text not null,
  vendor text,
  model text,
  router_identifier text,
  adapter_type public.adapter_type not null default 'mikrotik',
  status public.router_status not null default 'inactive',
  last_seen_at timestamptz,
  -- Référence vers la configuration (jamais de mot de passe en clair ici)
  configuration_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routers_organization_idx on public.routers (organization_id);
create index routers_site_idx on public.routers (site_id);

-- ------------------------------------------------------------
-- Devices
-- ------------------------------------------------------------
create type public.device_status as enum ('active', 'blocked', 'inactive');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  installation_id uuid not null unique,
  device_hash text,
  platform text,
  app_version text,
  status public.device_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index devices_organization_idx on public.devices (organization_id);
create index devices_user_idx on public.devices (user_id);

-- ------------------------------------------------------------
-- Trigger de mise à jour de updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();

create trigger set_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

create trigger set_routers_updated_at
  before update on public.routers
  for each row execute function public.set_updated_at();
