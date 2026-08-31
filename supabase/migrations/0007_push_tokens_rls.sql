-- ============================================================
-- 0007_push_tokens_rls.sql
-- WiFi Zone — Policy UPDATE pour push_tokens.
-- Permet à un utilisateur de réactiver/désactiver ou mettre à jour
-- ses propres tokens (nécessaire pour l'upsert du client).
-- ============================================================

-- Un utilisateur peut mettre à jour (réactiver, lier un device) ses
-- propres tokens. Le champ active n'est jamais transféré : with check
-- force user_id = auth.uid().
create policy "push_tokens_user_update"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
