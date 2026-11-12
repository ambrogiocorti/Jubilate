-- =============================================================================
-- Harden function grants on hosted Supabase.
--
-- On a hosted project the platform's default privileges grant EXECUTE on new
-- functions directly to anon/authenticated (not via PUBLIC), so the earlier
-- `revoke ... from public` statements left some functions callable by roles
-- that should not reach them. The local test shim did not reproduce this.
-- This migration makes the effective grants match the intended ones.
-- =============================================================================

-- Future functions created by this role: no implicit EXECUTE for API roles.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from anon, authenticated;

-- private: start from nothing, then re-grant only what RLS policies and
-- column defaults need (same list as the earlier migrations).
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  private.normalize_text(text),
  private.default_parish_id(),
  private.is_active_user(),
  private.has_role(public.app_role, uuid),
  private.is_admin(uuid),
  private.is_director(uuid),
  private.song_is_public(uuid),
  private.revision_is_public_current(uuid)
to anon, authenticated;

grant execute on function
  private.can_read_arrangement(uuid),
  private.can_read_score(uuid),
  private.can_write_score(uuid),
  private.owns_collection(uuid),
  private.can_manage_celebration(uuid),
  private.can_read_celebration(uuid),
  private.is_room_member(uuid),
  private.can_control_room(uuid),
  private.can_read_media_object(text)
to authenticated;

-- public RPCs that require a signed-in user: not callable by anon.
revoke execute on function
  public.admin_save_song(uuid, jsonb, jsonb, text, uuid[]),
  public.admin_restore_revision(uuid, text),
  public.admin_set_song_deleted(uuid, boolean),
  public.duplicate_collection(uuid, text),
  public.set_collection_link_sharing(uuid, boolean),
  public.review_contribution(uuid, text, text, boolean)
from anon;

-- Covering indexes for foreign keys flagged by the performance advisor.
create index if not exists director_requests_reviewed_by_idx on public.director_requests (reviewed_by);
create index if not exists media_assets_parish_idx on public.media_assets (parish_id);
create index if not exists music_scores_parish_idx on public.music_scores (parish_id);
create index if not exists rooms_parish_idx on public.rooms (parish_id);
create index if not exists user_roles_granted_by_idx on public.user_roles (granted_by);
create index if not exists user_roles_parish_idx on public.user_roles (parish_id);
create index if not exists user_roles_revoked_by_idx on public.user_roles (revoked_by);
