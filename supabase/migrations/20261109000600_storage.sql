-- =============================================================================
-- Jubilate — 0600 Storage
-- One private bucket "media" (audio, PDF, images). Size and MIME limits are
-- enforced by the bucket configuration; object paths are
--   <uploader user id>/<random uuid>.<ext>
-- so ownership can be checked from the path. Files are served through signed
-- URLs; reading requires a published media_asset referencing the object, being
-- the uploader, or being an administrator.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800, array[
  'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm','audio/x-m4a',
  'application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_read_media_object(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
      or (storage.foldername(p_name))[1] = (select auth.uid())::text
      or exists (select 1 from public.media_assets a
                  where a.storage_path = p_name and a.status = 'published'
                    and (a.song_id is null or private.song_is_public(a.song_id)))
$$;
grant execute on function private.can_read_media_object(text) to authenticated;

create policy media_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.can_read_media_object(name));

create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.is_active_user()));

create policy media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media'
         and ((select private.is_admin()) or (storage.foldername(name))[1] = (select auth.uid())::text));
