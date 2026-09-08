-- ============================================================
-- 0008_network_enum_values.sql
-- WiFi Zone — Ajout des valeurs d'enum 'network'.
--
-- PostgreSQL interdit d'UTILISER une valeur d'enum nouvellement ajoutée
-- (ALTER TYPE … ADD VALUE) dans la MÊME transaction. Or 0009 (allocation
-- réseau) référence 'authorizing' et 'paused' dans un index et des corps
-- de fonctions. On isole donc l'ajout des valeurs dans son propre fichier
-- (propre transaction), appliqué AVANT 0009.
-- ============================================================

alter type public.wifi_session_status add value if not exists 'authorizing';
alter type public.wifi_session_status add value if not exists 'paused';
