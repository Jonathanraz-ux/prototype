-- ============================================================
-- 0017 — Enregistre le routeur physique WiFi Zone (hAP ac²)
-- ============================================================
-- Pourquoi cette migration est nécessaire :
--
--   `network-health` répond `NOT_CONFIGURED` tant que la table
--   `public.routers` est VIDE pour le site, même lorsque le serveur
--   est parfaitement configuré (`supabase/functions/network-health/
--   index.ts` : `if (!routers.length) health = "NOT_CONFIGURED"`).
--
--   Ce vide a deux conséquences opérationnelles :
--     1. l'app affiche « État non configuré » alors que la chaîne
--        MikroTik est prête ;
--     2. `record_agent_heartbeat` ne trouve aucun routeur et ne peut
--        donc plus publier `active`/`offline` — l'état du routeur
--        reste invisible côté serveur.
--
--   `request-wifi-session` dégrade proprement (routeur NULL, session
--   créée quand même), ce qui masque encore davantage le problème :
--   la session démarrerait, mais sans routeur rattaché ni état publié.
--
-- Choix de conception :
--   • L'INSERT estConditionné à l'ABSENCE d'un routeur MikroTik sur le
--     site : la migration est idempotente et ne duplique jamais.
--   • L'organisation n'est pas codée en dur : elle est dérivée du site,
--     lui-même choisi comme le site de l'agent enregistré le plus
--     récemment modifié (le routeur appartient à la même organisation).
--   • `status` est laissé à 'inactive'. L'annoncer 'active' avant le
--     branchement serait un mensonge d'exploitation : c'est
--     `record_agent_heartbeat(p_router_ok => ...)` qui publiera
--     'active' dès que l'agent aura réellement joignable le routeur.
--   • `router_identifier` n'est PAS l'adresse IP de gestion ni aucun
--     identifiant d'accès : la table ne doit contenir aucune
--     information permettant de piloter le routeur depuis l'app
--     (invariant « pas d'identifiant routeur dans l'app »). Seul le
--     modèle commercial est renseigné. La valeur de gestion vit dans
--     `agent/.env`, hors dépôt et hors base.
-- ============================================================

insert into public.routers (
  organization_id,
  site_id,
  name,
  vendor,
  model,
  router_identifier,
  adapter_type,
  status,
  configuration_reference
)
select
  s.organization_id,
  s.id,
  'WiFi Zone — borne principale',
  'MikroTik',
  'hAP ac²',
  null,
  'mikrotik',
  'inactive',
  'Piloté par l''agent local (API binaire RouterOS, port 8728). Hôte de gestion : agent/.env.'
from public.sites s
where s.id = coalesce(
  (
    select a.site_id
    from public.local_agents a
    where a.site_id is not null
    group by a.site_id
    order by max(a.updated_at) desc
    limit 1
  ),
  (select id from public.sites order by created_at asc limit 1)
)
and not exists (
  select 1
  from public.routers r
  where r.site_id = s.id
    and r.adapter_type = 'mikrotik'
);