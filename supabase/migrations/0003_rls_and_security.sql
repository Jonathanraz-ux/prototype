-- ============================================================
-- 0003_rls_and_security.sql
-- WiFi Zone — Row Level Security, rôles serveur, fonctions de
-- sécurité. Cœur de la protection des données.
-- ============================================================

-- ------------------------------------------------------------
-- Helpers RLS partagés
-- ------------------------------------------------------------

-- Récupère l'organisation de l'utilisateur courant depuis son profil.
create or replace function public.current_organization_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = auth.uid();
$$;

-- Récupère le rôle de l'utilisateur courant.
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

-- Vrai si super_admin (impossible à modifier côté app, défini uniquement
-- via service_role / seed serveur).
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Vrai si admin de son organisation
create or replace function public.is_organization_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('organization_admin', 'super_admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Vrai si gestionnaire de site (ou plus)
create or replace function public.is_site_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('site_manager', 'organization_admin', 'super_admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------
-- ORGANIZATIONS
-- ------------------------------------------------------------
alter table public.organizations enable row level security;

create policy "organizations_org_admin_select"
  on public.organizations for select
  using (id = public.current_organization_id());

create policy "organizations_org_admin_update"
  on public.organizations for update
  using (id = public.current_organization_id());

create policy "organizations_superadmin_all"
  on public.organizations for all
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- PROFILES
-- Un utilisateur ne voit et ne modifie que son propre profil.
-- Un admin peut voir les profils de son organisation
-- et modifier rôle/statut (jamais en dessous de admin local).
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_self_select"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_org_admin_select"
  on public.profiles for select
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "profiles_self_update"
  on public.profiles for update
  using (id = auth.uid())
  -- Un utilisateur ne peut PAS modifier son propre rôle ni son statut.
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );

create policy "profiles_org_admin_update_role_and_status"
  on public.profiles for update
  using (public.is_organization_admin() and organization_id = public.current_organization_id())
  with check (public.is_organization_admin() and organization_id = public.current_organization_id());

-- ------------------------------------------------------------
-- LICENSES
-- Un client ne JAMAIS modifié sa licence. Lecture réservée aux
-- traitements serveur (autorisés) et aux admins pour consultation.
-- ------------------------------------------------------------
alter table public.licenses enable row level security;

create policy "licenses_no_client_write"
  on public.licenses for update
  using (false)
  with check (false);

create policy "licenses_no_client_insert"
  on public.licenses for insert
  with check (false);

create policy "licenses_no_client_delete"
  on public.licenses for delete
  using (false);

create policy "licenses_org_admin_select"
  on public.licenses for select
  using (organization_id = public.current_organization_id());

create policy "licenses_superadmin_all"
  on public.licenses for all
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- SITES
-- Un admin voit/modifie les sites de son organisation.
-- Un gestionnaire voit les sites de son organisation.
-- ------------------------------------------------------------
alter table public.sites enable row level security;

create policy "sites_select"
  on public.sites for select
  using (organization_id = public.current_organization_id());

create policy "sites_admin_insert"
  on public.sites for insert
  with check (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "sites_admin_update"
  on public.sites for update
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "sites_admin_delete"
  on public.sites for delete
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

-- ------------------------------------------------------------
-- ROUTERS
-- ------------------------------------------------------------
alter table public.routers enable row level security;

create policy "routers_select"
  on public.routers for select
  using (organization_id = public.current_organization_id());

create policy "routers_admin_insert"
  on public.routers for insert
  with check (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "routers_admin_update"
  on public.routers for update
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "routers_admin_delete"
  on public.routers for delete
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

-- ------------------------------------------------------------
-- DEVICES
-- Un utilisateur ne voit que ses propres appareils.
-- ------------------------------------------------------------
alter table public.devices enable row level security;

create policy "devices_self_select"
  on public.devices for select
  using (user_id = auth.uid());

create policy "devices_self_insert"
  on public.devices for insert
  with check (user_id = auth.uid());

create policy "devices_self_update"
  on public.devices for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status = (select status from public.devices where id = devices.id)
  );

create policy "devices_admin_select"
  on public.devices for select
  using (public.is_organization_admin() and organization_id = public.current_organization_id());

create policy "devices_admin_update_status"
  on public.devices for update
  using (public.is_organization_admin() and organization_id = public.current_organization_id());
