-- =============================================================================
-- Jubilate — 0300 Scores, personal arrangements and media
--
--   music_scores / score_versions   structured scores (MusicXML) with history.
--                                   owner_id NULL = official score of a song,
--                                   owner_id set  = personal score.
--   personal_arrangements           a user's own copy of a song (text, chords,
--                                   key, capo, optional score). Never touches the
--                                   official song. Optimistic concurrency via
--                                   `version`; every save snapshots the previous
--                                   state into arrangement_versions.
--   arrangement_shares              explicit sharing with other users; link
--                                   sharing uses an unguessable token resolved by
--                                   an RPC (tokens are never listable).
--   media_assets                    audio files, YouTube links, PDFs, images
--                                   (with provenance and rights).
-- =============================================================================

create type public.instrument as enum ('piano', 'organ', 'guitar', 'voice', 'choir', 'other');
create type public.share_visibility as enum ('private', 'users', 'link');
create type public.media_kind as enum ('audio', 'youtube', 'pdf', 'image');
create type public.media_status as enum ('pending', 'published', 'rejected', 'archived');

-- -----------------------------------------------------------------------------
-- Scores
-- -----------------------------------------------------------------------------
create table public.music_scores (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  song_id uuid references public.songs (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete cascade,  -- null = official
  title text not null check (char_length(title) between 1 and 160),
  instrument public.instrument not null default 'piano',
  status public.publication_status not null default 'draft',
  current_version_id uuid,
  source text check (source is null or char_length(source) <= 500),
  rights public.rights_status not null default 'unknown',
  rights_note text check (rights_note is null or char_length(rights_note) <= 1000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id is not null or song_id is not null)
);
create index music_scores_song_idx on public.music_scores (song_id);
create index music_scores_owner_idx on public.music_scores (owner_id);
create index music_scores_created_by_idx on public.music_scores (created_by);
create trigger music_scores_touch before update on public.music_scores
  for each row execute function private.touch_updated_at();

create table public.score_versions (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.music_scores (id) on delete cascade,
  version int not null check (version > 0),
  musicxml text not null check (octet_length(musicxml) <= 5 * 1024 * 1024),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (score_id, version)
);
create index score_versions_created_by_idx on public.score_versions (created_by);
alter table public.music_scores add constraint music_scores_current_version_fk
  foreign key (current_version_id) references public.score_versions (id) on delete set null;
create index music_scores_current_version_idx on public.music_scores (current_version_id);

-- New version number + make it current (insert-only history).
create or replace function private.score_versions_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.music_scores where id = new.score_id for update;
  select coalesce(max(version), 0) + 1 into new.version from public.score_versions where score_id = new.score_id;
  return new;
end;
$$;
create or replace function private.score_versions_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.music_scores set current_version_id = new.id where id = new.score_id;
  return null;
end;
$$;
create trigger score_versions_bi before insert on public.score_versions
  for each row execute function private.score_versions_before_insert();
create trigger score_versions_ai after insert on public.score_versions
  for each row execute function private.score_versions_after_insert();

-- -----------------------------------------------------------------------------
-- Personal arrangements
-- -----------------------------------------------------------------------------
create table public.personal_arrangements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  base_revision_id uuid references public.song_revisions (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 256 * 1024),
  display_key text check (display_key is null or display_key ~ '^[A-G](#|b)?m?$'),
  capo int not null default 0 check (capo between 0 and 11),
  score_id uuid references public.music_scores (id) on delete set null,
  visibility public.share_visibility not null default 'private',
  share_token text unique,
  is_draft boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'link') = (share_token is not null))
);
create index personal_arrangements_owner_idx on public.personal_arrangements (owner_id, updated_at desc);
create index personal_arrangements_song_idx on public.personal_arrangements (song_id);
create index personal_arrangements_base_idx on public.personal_arrangements (base_revision_id);
create index personal_arrangements_score_idx on public.personal_arrangements (score_id);

create table public.arrangement_versions (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.personal_arrangements (id) on delete cascade,
  version int not null,
  name text not null,
  content jsonb not null,
  display_key text,
  capo int not null default 0,
  created_at timestamptz not null default now(),
  unique (arrangement_id, version)
);

create table public.arrangement_shares (
  arrangement_id uuid not null references public.personal_arrangements (id) on delete cascade,
  shared_with uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (arrangement_id, shared_with)
);
create index arrangement_shares_user_idx on public.arrangement_shares (shared_with);

create or replace function private.arrangements_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.validate_song_content(new.content);
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id or new.song_id <> old.song_id then
      raise exception 'immutable_columns' using errcode = '42501';
    end if;
    if new.content is distinct from old.content or new.name is distinct from old.name
       or new.display_key is distinct from old.display_key or new.capo is distinct from old.capo then
      insert into public.arrangement_versions (arrangement_id, version, name, content, display_key, capo)
      values (old.id, old.version, old.name, old.content, old.display_key, old.capo)
      on conflict do nothing;
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
    new.updated_at := now();
  else
    new.version := 1;
  end if;
  return new;
end;
$$;
create trigger personal_arrangements_bw before insert or update on public.personal_arrangements
  for each row execute function private.arrangements_before_write();

create or replace function private.can_read_arrangement(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.personal_arrangements a where a.id = p_id and a.owner_id = (select auth.uid()))
      or exists (select 1 from public.arrangement_shares s where s.arrangement_id = p_id and s.shared_with = (select auth.uid()))
$$;
grant execute on function private.can_read_arrangement(uuid) to authenticated;

-- Copy official -> personal in one call (snapshot of current revision).
create or replace function public.create_personal_arrangement(p_song_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); v_rev uuid; v_id uuid; v_key text;
begin
  select current_revision_id, original_key into v_rev, v_key from public.songs
   where id = p_song_id and status = 'published' and deleted_at is null;
  if v_rev is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.personal_arrangements (owner_id, song_id, base_revision_id, name, content, display_key)
  values (v_uid, p_song_id, v_rev, coalesce(nullif(btrim(p_name), ''), 'La mia versione'),
          private.revision_content(v_rev), v_key)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.duplicate_personal_arrangement(p_id uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); a public.personal_arrangements; v_id uuid;
begin
  if not private.can_read_arrangement(p_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into a from public.personal_arrangements where id = p_id;
  insert into public.personal_arrangements (owner_id, song_id, base_revision_id, name, content, display_key, capo)
  values (v_uid, a.song_id, a.base_revision_id, coalesce(nullif(btrim(p_name), ''), a.name || ' (copia)'),
          a.content, a.display_key, a.capo)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_arrangement_link_sharing(p_id uuid, p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  if not exists (select 1 from public.personal_arrangements where id = p_id and owner_id = private.require_user()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_token := case when p_enabled then encode(extensions.gen_random_bytes(18), 'hex') end;
  update public.personal_arrangements
     set share_token = v_token,
         visibility = case when p_enabled then 'link' else 'private' end::public.share_visibility
   where id = p_id;
  return v_token;
end;
$$;

create or replace function public.get_shared_arrangement(p_token text)
returns table (id uuid, song_id uuid, name text, content jsonb, display_key text, capo int,
               owner_name text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.song_id, a.name, a.content, a.display_key, a.capo, p.display_name, a.updated_at
    from public.personal_arrangements a
    join public.profiles p on p.id = a.owner_id
   where (select auth.uid()) is not null
     and a.visibility = 'link' and a.share_token = p_token and length(p_token) >= 32
$$;

-- -----------------------------------------------------------------------------
-- Media assets
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  song_id uuid references public.songs (id) on delete cascade,
  kind public.media_kind not null,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  performer text check (performer is null or char_length(performer) <= 160),
  duration_seconds int check (duration_seconds is null or duration_seconds between 0 and 86400),
  storage_path text check (storage_path is null or storage_path ~ '^[A-Za-z0-9/_.-]{3,300}$'),
  external_url text check (external_url is null or external_url ~ '^https://(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/'),
  mime_type text check (mime_type is null or mime_type in (
    'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm','audio/x-m4a',
    'application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 52428800),
  source text check (source is null or char_length(source) <= 500),
  rights public.rights_status not null default 'unknown',
  rights_note text check (rights_note is null or char_length(rights_note) <= 1000),
  status public.media_status not null default 'pending',
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'youtube') = (external_url is not null)),
  check (kind = 'youtube' or storage_path is not null)
);
create index media_assets_song_idx on public.media_assets (song_id, status);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create trigger media_assets_touch before update on public.media_assets
  for each row execute function private.touch_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.music_scores enable row level security;
alter table public.score_versions enable row level security;
alter table public.personal_arrangements enable row level security;
alter table public.arrangement_versions enable row level security;
alter table public.arrangement_shares enable row level security;
alter table public.media_assets enable row level security;

create or replace function private.can_read_score(p_score uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.music_scores m
     where m.id = p_score
       and ((m.owner_id is null and m.status = 'published' and private.song_is_public(m.song_id))
            or m.owner_id = (select auth.uid())
            or private.is_admin(m.parish_id)
            or exists (select 1 from public.personal_arrangements a
                        where a.score_id = m.id and private.can_read_arrangement(a.id))))
$$;
create or replace function private.can_write_score(p_score uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.music_scores m where m.id = p_score
                  and ((m.owner_id = (select auth.uid()) and private.is_active_user())
                       or (m.owner_id is null and private.is_admin(m.parish_id))))
$$;
grant execute on function private.can_read_score(uuid), private.can_write_score(uuid) to authenticated;

create policy music_scores_read on public.music_scores for select to authenticated
  using (private.can_read_score(id));
create policy music_scores_insert on public.music_scores for insert to authenticated
  with check ((owner_id = (select auth.uid()) and (select private.is_active_user()))
              or (owner_id is null and (select private.is_admin(parish_id))));
create policy music_scores_update on public.music_scores for update to authenticated
  using (private.can_write_score(id))
  with check ((owner_id = (select auth.uid())) or (owner_id is null and (select private.is_admin(parish_id))));
create policy music_scores_delete on public.music_scores for delete to authenticated
  using (private.can_write_score(id));

create policy score_versions_read on public.score_versions for select to authenticated
  using (private.can_read_score(score_id));
create policy score_versions_insert on public.score_versions for insert to authenticated
  with check (private.can_write_score(score_id));

create policy arrangements_read on public.personal_arrangements for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_read_arrangement(id));
create policy arrangements_insert on public.personal_arrangements for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_active_user()));
create policy arrangements_update on public.personal_arrangements for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy arrangements_delete on public.personal_arrangements for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy arrangement_versions_read on public.arrangement_versions for select to authenticated
  using (exists (select 1 from public.personal_arrangements a
                  where a.id = arrangement_id and a.owner_id = (select auth.uid())));

create policy arrangement_shares_read on public.arrangement_shares for select to authenticated
  using (shared_with = (select auth.uid()) or exists (
    select 1 from public.personal_arrangements a where a.id = arrangement_id and a.owner_id = (select auth.uid())));
create policy arrangement_shares_insert on public.arrangement_shares for insert to authenticated
  with check (exists (select 1 from public.personal_arrangements a
                       where a.id = arrangement_id and a.owner_id = (select auth.uid())));
create policy arrangement_shares_delete on public.arrangement_shares for delete to authenticated
  using (exists (select 1 from public.personal_arrangements a
                  where a.id = arrangement_id and a.owner_id = (select auth.uid())));

create policy media_assets_read on public.media_assets for select to authenticated
  using ((status = 'published' and (song_id is null or private.song_is_public(song_id)))
         or uploaded_by = (select auth.uid())
         or (select private.is_admin(parish_id)));
-- Users may submit media only as 'pending' (admin publishes); admins any status.
create policy media_assets_insert on public.media_assets for insert to authenticated
  with check ((uploaded_by = (select auth.uid()) and status = 'pending' and (select private.is_active_user()))
              or (select private.is_admin(parish_id)));
create policy media_assets_admin_update on public.media_assets for update to authenticated
  using ((select private.is_admin(parish_id))) with check ((select private.is_admin(parish_id)));
create policy media_assets_delete on public.media_assets for delete to authenticated
  using ((select private.is_admin(parish_id)) or (uploaded_by = (select auth.uid()) and status = 'pending'));

revoke all on public.music_scores, public.score_versions, public.personal_arrangements,
  public.arrangement_versions, public.arrangement_shares, public.media_assets from anon, authenticated;
grant select, insert, delete on public.music_scores to authenticated;
grant update (title, instrument, status, source, rights, rights_note) on public.music_scores to authenticated;
grant select, insert (score_id, musicxml, note) on public.score_versions to authenticated;
grant select, delete on public.personal_arrangements to authenticated;
grant insert (song_id, base_revision_id, name, content, display_key, capo, score_id, is_draft)
  on public.personal_arrangements to authenticated;
grant update (name, content, display_key, capo, score_id, is_draft) on public.personal_arrangements to authenticated;
grant select on public.arrangement_versions to authenticated;
grant select, insert, delete on public.arrangement_shares to authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;

revoke execute on function public.create_personal_arrangement(uuid, text),
  public.duplicate_personal_arrangement(uuid, text), public.set_arrangement_link_sharing(uuid, boolean),
  public.get_shared_arrangement(text) from public, anon;
grant execute on function public.create_personal_arrangement(uuid, text),
  public.duplicate_personal_arrangement(uuid, text), public.set_arrangement_link_sharing(uuid, boolean),
  public.get_shared_arrangement(text) to authenticated;
