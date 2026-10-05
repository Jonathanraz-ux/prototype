-- ============================================================
-- 0016 — devices : RLS compatible UPSERT + garde-fou `status`
-- ============================================================
-- Problème observé (docs/ETAT_PROJET.md §4.2) :
--   `register-device` répond 500 `device_failed` au SECOND lancement.
--
-- Cause racine — la policy `devices_self_update` de la migration 0003 :
--
--     create policy "devices_self_update" on public.devices for update
--       using (user_id = auth.uid())
--       with check (user_id = auth.uid()
--                   and status = (select status from public.devices
--                                  where id = devices.id));
--
--   1. La clause `with check` auto-référencente est évaluée pendant un
--      `INSERT ... ON CONFLICT DO UPDATE` (upsert de Supabase) avec un
--      instantané qui ne voit pas la ligne en cours d'écriture : le
--      `status` relu est l'ancien, la ligne à écrire porte le nouveau
--      → refus 42501/21000, l'upsert échoue.
--   2. Même sur un UPDATE simple, la policy interdit TOUTE évolution de
--      `status` par l'utilisateur — ce que `register-device` cherche
--      précisément à faire pour réactiver un appareil suspendu/inactif.
--   3. Le repli `update({ status: "active" })` de la fonction
--      `register-device` est donc voué à l'échec lui aussi.
--
-- Correction appliquée (migration idempotente et cumulative) :
--   a) la policy `devices_self_update` ne compare plus la ligne à elle-même
--      → l'upsert redevient possible ;
--   b) l'immuabilité de `status` pour l'utilisateur est déplacée dans un
--      déclencheur BEFORE UPDATE, qui n'est ni récursif ni dépendant d'un
--      ordre d'évaluation de sous-requête ;
--   c) ce déclencheur n'autorise le changement que si l'écriture est
--      déjà privilégiée (service_role) ou provient d'un administrateur
--      d'organisation — la protection d'origine est donc conservée.
--
-- `register-device` ÉCRIT aujourd'hui avec la clé `service_role` (après avoir
-- validé le JWT de l'utilisateur) : c'est ce qui permet de réactiver un
-- appareil suspendu, la policy (a) ci-dessus ne l'autorisant pas. Les
-- policies (a)/(b) restent néanmoins nécessaires et correctes pour tout
-- client qui écrit avec le jeton de l'utilisateur (et l'insérent dans le
-- modèle RLS au lieu de le contourner).

-- ------------------------------------------------------------
-- 1. Garde-fou `status` : déclencheur déterministe, sans sous-requête
--    sur la table en cours de modification.
-- ------------------------------------------------------------
create or replace function public.devices_guard_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    -- Écritures déjà privilégiées :
    --   - `service_role` (Edge Functions register-device, agent) via le
    --     claim JWT `auth.role()` appelé par PostgREST ;
    --   - `current_user` : exécutions en base directes (migrations,
    --     `supabase db push`, éditeur SQL). Hors PostgREST, `auth.role()`
    --     vaut NULL : sans cette branche, aucune correction d'exploration
    --     en base ne serait possible.
    if auth.role() is distinct from 'service_role'
       and current_user not in ('postgres', 'service_role', 'supabase_admin')
       and not public.is_organization_admin() then
      raise exception 'devices.status est reserve au serveur'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists devices_guard_status_update_trg on public.devices;
create trigger devices_guard_status_update_trg
  before update on public.devices
  for each row
  execute function public.devices_guard_status_update();

-- ------------------------------------------------------------
-- 2. Policy compatible upsert : plus de comparaison à la ligne elle-même.
--    L'utilisateur reste cantonné à SON appareil (using + with check).
-- ------------------------------------------------------------
drop policy if exists "devices_self_update" on public.devices;
create policy "devices_self_update"
  on public.devices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- L'upsert passe aussi par la branche INSERT de `on conflict` : on
-- recrée la policy d'insertion alignée sur la précédente (idempotent).
drop policy if exists "devices_self_insert" on public.devices;
create policy "devices_self_insert"
  on public.devices for insert
  with check (user_id = auth.uid());
