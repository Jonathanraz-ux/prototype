-- ============================================================
-- 0015_fallback_demo_duration.sql
-- Aligne la durée déclarée de la campagne de repli sur la durée
-- RÉELLE de la vidéo locale embarquée (assets/demo-ad.mp4 ≈ 5,1 s).
-- La validation complete_ad_view exige watched_seconds >=
-- duration_seconds (lecture obligatoire à 100 %). Avec la campagne
-- initiale (10 s) la lecture réelle (~5 s) produisait 'too_early' et
-- l'accès restait coupé. 4 s garantit la marge tout en maintenant
-- un visionnage réel (5 s) validé.
-- ============================================================

update public.ad_campaigns
  set duration_seconds = 4
  where is_fallback = true
    and duration_seconds <> 4;