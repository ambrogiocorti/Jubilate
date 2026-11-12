-- =============================================================================
-- Function grants. On hosted Supabase new public functions get EXECUTE for
-- anon/authenticated by default (reproduced in local-shim.sql), so every
-- SECURITY DEFINER function reachable by an API role must be on an allowlist.
-- Runs after 01_security.sql, which defines the tests.* helpers.
-- =============================================================================
reset role;

create temp view definer_exec as
  select r.rolname, n.nspname || '.' || p.proname as fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where n.nspname in ('public', 'private') and p.prosecdef
    and has_function_privilege(r.rolname, p.oid, 'execute');

-- anon: only the RLS helpers used by public-read policies and the two
-- public-link readers.
select tests.expect('anon executes only allowlisted definer functions', not exists (
  select 1 from definer_exec where rolname = 'anon' and fn not in (
    'private.default_parish_id', 'private.has_role', 'private.is_active_user',
    'private.is_admin', 'private.is_director', 'private.revision_is_public_current',
    'private.song_is_public', 'public.get_revision_content', 'public.get_shared_collection')));

select tests.expect('anon cannot call admin or write RPCs', not exists (
  select 1 from definer_exec where rolname = 'anon' and fn in (
    'public.admin_save_song', 'public.admin_restore_revision', 'public.admin_set_song_deleted',
    'public.admin_set_role', 'public.admin_set_suspended', 'public.admin_list_users',
    'public.duplicate_collection', 'public.set_collection_link_sharing',
    'public.review_contribution', 'public.create_room', 'public.step_room',
    'public.delete_my_account')));

select tests.expect('anon cannot use private write checks', not exists (
  select 1 from definer_exec where rolname = 'anon' and fn in (
    'private.can_write_score', 'private.can_control_room', 'private.owns_collection')));

select tests.expect('authenticated keeps the RPCs the app calls', (
  select count(*) from definer_exec where rolname = 'authenticated' and fn in (
    'public.admin_save_song', 'public.join_room', 'public.step_room',
    'public.review_contribution', 'private.can_write_score', 'public.delete_my_account')) = 6);

\echo '# function grant tests passed'
