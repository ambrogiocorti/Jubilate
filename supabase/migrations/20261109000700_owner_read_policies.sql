-- Owners must be able to read rows they have just inserted (INSERT … RETURNING).
-- A STABLE helper function evaluated in the same statement does not see the new
-- row, so the ownership check is repeated inline in the policy.
drop policy music_scores_read on public.music_scores;
create policy music_scores_read on public.music_scores for select to authenticated
  using (owner_id = (select auth.uid())
         or (owner_id is null and (select private.is_admin(parish_id)))
         or private.can_read_score(id));

-- Same for celebrations created as drafts by their author.
drop policy celebrations_read on public.celebrations;
create policy celebrations_read on public.celebrations for select to authenticated
  using (status <> 'draft' or created_by = (select auth.uid()) or private.can_manage_celebration(id));
