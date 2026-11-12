-- =============================================================================
-- Self-service account deletion (GDPR art. 17).
--
-- Deleting the auth user cascades to public.profiles and from there to every
-- row that belongs to the user (roles, collections, drafts, requests...).
-- Content published for the parish keeps existing with its author set to null.
-- The last active administrator cannot delete their account, so the parish is
-- never left without someone who can manage it.
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  -- Suspended users may still delete their own account, so only require a session.
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if exists (
       select 1 from public.user_roles me
        where me.user_id = v_uid and me.role = 'admin' and me.revoked_at is null
          and not exists (
            select 1 from public.user_roles other
             where other.parish_id = me.parish_id and other.role = 'admin'
               and other.revoked_at is null and other.user_id <> v_uid))
  then
    raise exception 'last_admin' using errcode = 'P0001',
      hint = 'Nominate another administrator before deleting this account.';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
