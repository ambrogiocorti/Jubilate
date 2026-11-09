-- =============================================================================
-- Jubilate — 0200 Song library
--
-- Separation of concerns (see DATABASE.md):
--   songs               metadata only (number, title, authors, key, status...)
--   song_revisions      immutable official revisions (history); songs points to
--                       the current one. A new revision never destroys the old.
--   song_sections       lyric sections of a revision (verse, chorus, ...), with
--                       line breaks preserved as text[]; defined ONCE each.
--   song_revisions.sequence  performance order as a list of section keys, so a
--                       repeated chorus is referenced, not duplicated.
--   chord_arrangements  chord placements for a revision, anchored to
--                       (section key, line index, character offset): no spaces
--                       are used for alignment.
--   song_categories / song_category_links  many-to-many categorisation.
-- =============================================================================

create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.section_kind as enum ('verse', 'chorus', 'bridge', 'intro', 'outro', 'refrain', 'antiphon', 'other');
create type public.category_kind as enum ('mass_moment', 'liturgical_season', 'theme', 'other');
create type public.rights_status as enum ('unknown', 'public_domain', 'own_work', 'permission_granted', 'licensed');

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
create table public.song_categories (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  kind public.category_kind not null default 'other',
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parish_id, slug)
);
create trigger song_categories_touch before update on public.song_categories
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Songs (metadata)
-- -----------------------------------------------------------------------------
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  number int check (number is null or number between 1 and 99999),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  alt_titles text[] not null default '{}' check (cardinality(alt_titles) <= 10),
  author text check (author is null or char_length(author) <= 200),
  composer text check (composer is null or char_length(composer) <= 200),
  original_key text check (original_key is null or original_key ~ '^[A-G](#|b)?m?$'),
  time_signature text check (time_signature is null or time_signature ~ '^[0-9]{1,2}/(1|2|4|8|16|32)$'),
  tempo_bpm int check (tempo_bpm is null or tempo_bpm between 20 and 300),
  status public.publication_status not null default 'draft',
  current_revision_id uuid,           -- FK added after song_revisions exists
  -- provenance & rights of the TEXT (scores and recordings carry their own)
  text_source text check (text_source is null or char_length(text_source) <= 500),
  text_rights public.rights_status not null default 'unknown',
  text_rights_note text check (text_rights_note is null or char_length(text_rights_note) <= 1000),
  -- search (maintained by trigger; normalized: no accents, lower case)
  search_text text not null default '',
  first_line text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,            -- soft delete (recoverable)
  deleted_by uuid references public.profiles (id) on delete set null
);
-- Booklet number unique within a parish (ignoring soft-deleted songs).
create unique index songs_parish_number_unique on public.songs (parish_id, number)
  where number is not null and deleted_at is null;
create index songs_listing_idx on public.songs (parish_id, status, number) where deleted_at is null;
create index songs_search_trgm on public.songs using gin (search_text extensions.gin_trgm_ops);
create index songs_search_fts on public.songs using gin (to_tsvector('simple', search_text));
create index songs_created_by_idx on public.songs (created_by);
create index songs_deleted_by_idx on public.songs (deleted_by);

create trigger songs_touch before update on public.songs
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Official revisions (immutable)
-- -----------------------------------------------------------------------------
create table public.song_revisions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  revision_number int not null check (revision_number > 0),
  sequence text[] not null check (cardinality(sequence) between 1 and 200),
  note text check (note is null or char_length(note) <= 1000),
  contribution_id uuid,               -- set when generated by an approved contribution
  restored_from uuid references public.song_revisions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (song_id, revision_number)
);
create index song_revisions_created_by_idx on public.song_revisions (created_by);
create index song_revisions_restored_idx on public.song_revisions (restored_from);

alter table public.songs
  add constraint songs_current_revision_fk foreign key (current_revision_id)
  references public.song_revisions (id) on delete set null;
create index songs_current_revision_idx on public.songs (current_revision_id);

create table public.song_sections (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.song_revisions (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,24}$'),
  position int not null check (position >= 0),
  kind public.section_kind not null,
  label text check (label is null or char_length(label) <= 60),
  lines text[] not null check (cardinality(lines) between 1 and 80),
  unique (revision_id, key),
  unique (revision_id, position)
);

create table public.chord_arrangements (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.song_revisions (id) on delete cascade,
  name text not null default 'Accordi' check (char_length(name) between 1 and 80),
  base_key text check (base_key is null or base_key ~ '^[A-G](#|b)?m?$'),
  is_default boolean not null default true,
  -- [{ "section": "v1", "line": 0, "offset": 4, "chord": "Am7" }, ...]
  placements jsonb not null default '[]'::jsonb check (jsonb_typeof(placements) = 'array'),
  created_at timestamptz not null default now()
);
create unique index chord_arrangements_one_default on public.chord_arrangements (revision_id) where is_default;

create table public.song_category_links (
  song_id uuid not null references public.songs (id) on delete cascade,
  category_id uuid not null references public.song_categories (id) on delete cascade,
  primary key (song_id, category_id)
);
create index song_category_links_category_idx on public.song_category_links (category_id);

-- -----------------------------------------------------------------------------
-- Content validation. Song content travels as one JSON document between client
-- and RPC and is stored normalized. Shape (shared with src/domain/song.ts):
--   { "sections": [{ "key", "kind", "label"?, "lines": [text] }],
--     "sequence": [key],
--     "chords":   [{ "section", "line", "offset", "chord" }],
--     "key": "G"? }
-- -----------------------------------------------------------------------------
create or replace function private.validate_song_content(p jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  s jsonb; c jsonb; keys text[] := '{}'::text[]; k text; nlines int; line text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_content: not an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'sections') <> 'array' or jsonb_array_length(p -> 'sections') = 0 then
    raise exception 'invalid_content: sections required' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'sections') > 60 then
    raise exception 'invalid_content: too many sections' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p -> 'sections') loop
    k := s ->> 'key';
    if k is null or k !~ '^[a-z0-9_-]{1,24}$' then
      raise exception 'invalid_content: bad section key %', coalesce(k, 'null') using errcode = '22023';
    end if;
    if k = any(keys) then
      raise exception 'invalid_content: duplicate section key %', k using errcode = '22023';
    end if;
    keys := keys || k;
    if (s ->> 'kind') is null or not ((s ->> 'kind') = any(enum_range(null::public.section_kind)::text[])) then
      raise exception 'invalid_content: bad section kind' using errcode = '22023';
    end if;
    if jsonb_typeof(s -> 'lines') <> 'array' or jsonb_array_length(s -> 'lines') = 0
       or jsonb_array_length(s -> 'lines') > 80 then
      raise exception 'invalid_content: section % lines', k using errcode = '22023';
    end if;
    for line in select jsonb_array_elements_text(s -> 'lines') loop
      if char_length(line) > 300 then
        raise exception 'invalid_content: line too long' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if jsonb_typeof(p -> 'sequence') <> 'array' or jsonb_array_length(p -> 'sequence') = 0 then
    raise exception 'invalid_content: sequence required' using errcode = '22023';
  end if;
  for k in select jsonb_array_elements_text(p -> 'sequence') loop
    if not (k = any(keys)) then
      raise exception 'invalid_content: sequence references unknown section %', k using errcode = '22023';
    end if;
  end loop;

  if p ? 'chords' then
    if jsonb_typeof(p -> 'chords') <> 'array' or jsonb_array_length(p -> 'chords') > 2000 then
      raise exception 'invalid_content: chords' using errcode = '22023';
    end if;
    for c in select * from jsonb_array_elements(p -> 'chords') loop
      k := c ->> 'section';
      select jsonb_array_length(x -> 'lines') into nlines
        from jsonb_array_elements(p -> 'sections') x where x ->> 'key' = k;
      if nlines is null then
        raise exception 'invalid_content: chord on unknown section' using errcode = '22023';
      end if;
      if jsonb_typeof(c -> 'line') <> 'number' or (c ->> 'line')::int < 0 or (c ->> 'line')::int >= nlines
         or jsonb_typeof(c -> 'offset') <> 'number' or (c ->> 'offset')::int < 0 or (c ->> 'offset')::int > 300
         or coalesce(char_length(c ->> 'chord'), 0) not between 1 and 24 then
        raise exception 'invalid_content: bad chord placement' using errcode = '22023';
      end if;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Search document: title, alternative titles, authors and the lyrics of the
-- current revision, normalized. Maintained BEFORE INSERT/UPDATE.
-- -----------------------------------------------------------------------------
create or replace function private.songs_refresh_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_lyrics text := ''; v_first text := '';
begin
  if new.current_revision_id is not null then
    select coalesce(string_agg(array_to_string(s.lines, ' '), ' ' order by s.position), ''),
           coalesce((array_agg(s.lines[1] order by s.position))[1], '')
      into v_lyrics, v_first
      from public.song_sections s where s.revision_id = new.current_revision_id;
  end if;
  new.first_line := left(v_first, 200);
  new.search_text := private.normalize_text(concat_ws(' ',
    new.number::text, new.title, array_to_string(new.alt_titles, ' '),
    new.author, new.composer, v_lyrics));
  return new;
end;
$$;

create trigger songs_search before insert or update of title, alt_titles, author, composer, number, current_revision_id
  on public.songs for each row execute function private.songs_refresh_search();

-- -----------------------------------------------------------------------------
-- Creates a new official revision from a content document and makes it current.
-- Internal: callers must have authorized the operation.
-- -----------------------------------------------------------------------------
create or replace function private.create_revision(
  p_song_id uuid, p_content jsonb, p_note text, p_contribution uuid default null, p_restored_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_rev uuid; v_num int; s jsonb; i int := 0;
begin
  perform private.validate_song_content(p_content);
  perform 1 from public.songs where id = p_song_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select coalesce(max(revision_number), 0) + 1 into v_num from public.song_revisions where song_id = p_song_id;

  insert into public.song_revisions (song_id, revision_number, sequence, note, contribution_id, restored_from, created_by)
  values (p_song_id, v_num,
          array(select jsonb_array_elements_text(p_content -> 'sequence')),
          nullif(btrim(p_note), ''), p_contribution, p_restored_from, (select auth.uid()))
  returning id into v_rev;

  for s in select * from jsonb_array_elements(p_content -> 'sections') loop
    insert into public.song_sections (revision_id, key, position, kind, label, lines)
    values (v_rev, s ->> 'key', i, (s ->> 'kind')::public.section_kind,
            nullif(btrim(s ->> 'label'), ''),
            array(select jsonb_array_elements_text(s -> 'lines')));
    i := i + 1;
  end loop;

  if jsonb_array_length(coalesce(p_content -> 'chords', '[]'::jsonb)) > 0 then
    insert into public.chord_arrangements (revision_id, base_key, placements)
    values (v_rev, nullif(p_content ->> 'key', ''), p_content -> 'chords');
  end if;

  update public.songs set current_revision_id = v_rev,
         original_key = coalesce(nullif(p_content ->> 'key', ''), original_key)
   where id = p_song_id;
  return v_rev;
end;
$$;

-- Serializes a revision back into the content document.
create or replace function private.revision_content(p_revision_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sections', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'key', s.key, 'kind', s.kind, 'label', s.label, 'lines', to_jsonb(s.lines)))
                   order by s.position)
                  from public.song_sections s where s.revision_id = r.id), '[]'::jsonb),
    'sequence', to_jsonb(r.sequence),
    'chords', coalesce((select c.placements from public.chord_arrangements c
                        where c.revision_id = r.id and c.is_default), '[]'::jsonb),
    'key', (select c.base_key from public.chord_arrangements c where c.revision_id = r.id and c.is_default)
  )
  from public.song_revisions r where r.id = p_revision_id
$$;

-- =============================================================================
-- Admin RPCs
-- =============================================================================

-- Creates or updates a song (metadata + optional new content revision +
-- categories) in a single transaction.
create or replace function public.admin_save_song(
  p_song_id uuid, p_meta jsonb, p_content jsonb default null, p_note text default null,
  p_category_ids uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := p_song_id; v_parish uuid := private.default_parish_id(); v_new boolean := p_song_id is null;
begin
  perform private.require_admin(v_parish);
  if jsonb_typeof(coalesce(p_meta, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_meta' using errcode = '22023';
  end if;

  if v_new then
    insert into public.songs (parish_id, number, title, alt_titles, author, composer, original_key,
                              time_signature, tempo_bpm, status, text_source, text_rights, text_rights_note, created_by)
    values (v_parish,
            nullif(p_meta ->> 'number', '')::int,
            btrim(p_meta ->> 'title'),
            coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p_meta -> 'alt_titles', '[]')) x where btrim(x) <> ''), '{}'),
            nullif(btrim(p_meta ->> 'author'), ''),
            nullif(btrim(p_meta ->> 'composer'), ''),
            nullif(p_meta ->> 'original_key', ''),
            nullif(p_meta ->> 'time_signature', ''),
            nullif(p_meta ->> 'tempo_bpm', '')::int,
            coalesce(nullif(p_meta ->> 'status', ''), 'draft')::public.publication_status,
            nullif(btrim(p_meta ->> 'text_source'), ''),
            coalesce(nullif(p_meta ->> 'text_rights', ''), 'unknown')::public.rights_status,
            nullif(btrim(p_meta ->> 'text_rights_note'), ''),
            (select auth.uid()))
    returning id into v_id;
  else
    update public.songs set
      number = case when p_meta ? 'number' then nullif(p_meta ->> 'number', '')::int else number end,
      title = coalesce(nullif(btrim(p_meta ->> 'title'), ''), title),
      alt_titles = case when p_meta ? 'alt_titles' then coalesce(array(select btrim(x) from jsonb_array_elements_text(p_meta -> 'alt_titles') x where btrim(x) <> ''), '{}') else alt_titles end,
      author = case when p_meta ? 'author' then nullif(btrim(p_meta ->> 'author'), '') else author end,
      composer = case when p_meta ? 'composer' then nullif(btrim(p_meta ->> 'composer'), '') else composer end,
      original_key = case when p_meta ? 'original_key' then nullif(p_meta ->> 'original_key', '') else original_key end,
      time_signature = case when p_meta ? 'time_signature' then nullif(p_meta ->> 'time_signature', '') else time_signature end,
      tempo_bpm = case when p_meta ? 'tempo_bpm' then nullif(p_meta ->> 'tempo_bpm', '')::int else tempo_bpm end,
      status = case when p_meta ? 'status' then (p_meta ->> 'status')::public.publication_status else status end,
      text_source = case when p_meta ? 'text_source' then nullif(btrim(p_meta ->> 'text_source'), '') else text_source end,
      text_rights = case when p_meta ? 'text_rights' then (p_meta ->> 'text_rights')::public.rights_status else text_rights end,
      text_rights_note = case when p_meta ? 'text_rights_note' then nullif(btrim(p_meta ->> 'text_rights_note'), '') else text_rights_note end
    where id = v_id and deleted_at is null;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;

  if p_content is not null then
    perform private.create_revision(v_id, p_content, p_note);
  end if;

  if p_category_ids is not null then
    delete from public.song_category_links where song_id = v_id;
    insert into public.song_category_links (song_id, category_id)
    select v_id, c from unnest(p_category_ids) c on conflict do nothing;
  end if;

  if (select status from public.songs where id = v_id) = 'published'
     and (select current_revision_id from public.songs where id = v_id) is null then
    raise exception 'cannot_publish_without_content' using errcode = 'P0001';
  end if;

  perform private.log_activity(case when v_new then 'song.created' else 'song.updated' end, 'song', v_id,
    jsonb_build_object('content_changed', p_content is not null, 'note', p_note));
  return v_id;
exception when unique_violation then
  raise exception 'duplicate_song_number' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_restore_revision(p_revision_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_song uuid; v_new uuid;
begin
  select song_id into v_song from public.song_revisions where id = p_revision_id;
  if v_song is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_admin((select parish_id from public.songs where id = v_song));
  v_new := private.create_revision(v_song, private.revision_content(p_revision_id),
             coalesce(p_note, 'Ripristino revisione'), null, p_revision_id);
  perform private.log_activity('song.revision_restored', 'song', v_song,
    jsonb_build_object('from_revision', p_revision_id, 'new_revision', v_new));
  return v_new;
end;
$$;

create or replace function public.admin_set_song_deleted(p_song_id uuid, p_deleted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin((select parish_id from public.songs where id = p_song_id));
  update public.songs
     set deleted_at = case when p_deleted then now() end,
         deleted_by = case when p_deleted then (select auth.uid()) end
   where id = p_song_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_activity(case when p_deleted then 'song.deleted' else 'song.restored' end, 'song', p_song_id);
exception when unique_violation then
  raise exception 'duplicate_song_number' using errcode = 'P0001';
end;
$$;

-- Returns the content document of a revision with the same visibility as its
-- rows: current revision of a published song (or any revision for admins);
-- chords only for registered users.
create or replace function public.get_revision_content(p_revision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if not (private.revision_is_public_current(p_revision_id) or private.is_admin()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v := private.revision_content(p_revision_id);
  if (select auth.uid()) is null then
    v := v || jsonb_build_object('chords', '[]'::jsonb, 'key', null);
  end if;
  return v;
end;
$$;

-- Server-side search (the client also searches a cached index for offline use).
create or replace function public.search_songs(p_query text, p_category_ids uuid[] default null, p_limit int default 50)
returns table (id uuid, number int, title text, alt_titles text[], author text, first_line text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select private.normalize_text(p_query) as t)
  select s.id, s.number, s.title, s.alt_titles, s.author, s.first_line,
         (case when q.t ~ '^[0-9]+$' and s.number = q.t::int then 10 else 0 end
          + case when private.normalize_text(s.title) like q.t || '%' then 3 else 0 end
          + extensions.similarity(private.normalize_text(s.title), q.t) * 2
          + case when q.t <> '' and (' ' || s.search_text || ' ') like '% ' || q.t || ' %' then 1.5
                 when q.t <> '' and s.search_text like '%' || q.t || '%' then 1 else 0 end
          + ts_rank(to_tsvector('simple', s.search_text), plainto_tsquery('simple', q.t)))::real as rank
    from public.songs s, q
   where s.deleted_at is null and s.status = 'published'
     and (q.t = '' or s.search_text like '%' || q.t || '%'
          or to_tsvector('simple', s.search_text) @@ plainto_tsquery('simple', q.t)
          or extensions.word_similarity(q.t, s.search_text) > 0.45)
     and (p_category_ids is null or exists (
          select 1 from public.song_category_links l where l.song_id = s.id and l.category_id = any(p_category_ids)))
   order by rank desc, s.number nulls last, s.title
   limit least(greatest(p_limit, 1), 200)
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.song_categories enable row level security;
alter table public.songs enable row level security;
alter table public.song_revisions enable row level security;
alter table public.song_sections enable row level security;
alter table public.chord_arrangements enable row level security;
alter table public.song_category_links enable row level security;

create or replace function private.song_is_public(p_song_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.songs s where s.id = p_song_id and s.status = 'published' and s.deleted_at is null) $$;

create or replace function private.revision_is_public_current(p_revision_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.songs s
                  where s.current_revision_id = p_revision_id and s.status = 'published' and s.deleted_at is null)
$$;
grant execute on function private.song_is_public(uuid), private.revision_is_public_current(uuid) to anon, authenticated;

create policy song_categories_read on public.song_categories for select to anon, authenticated
  using (archived_at is null or (select private.is_admin(parish_id)));
create policy song_categories_admin_insert on public.song_categories for insert to authenticated
  with check ((select private.is_admin(parish_id)));
create policy song_categories_admin_update on public.song_categories for update to authenticated
  using ((select private.is_admin(parish_id))) with check ((select private.is_admin(parish_id)));
create policy song_categories_admin_delete on public.song_categories for delete to authenticated
  using ((select private.is_admin(parish_id)));

-- Songs: visitors and users read published songs; admins read everything.
-- Writes go through admin_save_song (no direct write policies).
create policy songs_read on public.songs for select to anon, authenticated
  using ((status = 'published' and deleted_at is null) or (select private.is_admin(parish_id)));

create policy song_revisions_read on public.song_revisions for select to anon, authenticated
  using (private.revision_is_public_current(id) or (select private.is_admin()));

create policy song_sections_read on public.song_sections for select to anon, authenticated
  using (private.revision_is_public_current(revision_id) or (select private.is_admin()));

-- Chords are reserved to registered users (spec §4.1/§4.2).
create policy chord_arrangements_read on public.chord_arrangements for select to authenticated
  using (private.revision_is_public_current(revision_id) or (select private.is_admin()));

create policy song_category_links_read on public.song_category_links for select to anon, authenticated
  using (private.song_is_public(song_id) or (select private.is_admin()));

revoke all on public.song_categories, public.songs, public.song_revisions, public.song_sections,
  public.chord_arrangements, public.song_category_links from anon, authenticated;
grant select on public.song_categories, public.songs, public.song_revisions, public.song_sections,
  public.song_category_links to anon, authenticated;
grant select on public.chord_arrangements to authenticated;
grant insert, update, delete on public.song_categories to authenticated;

revoke execute on function public.admin_save_song(uuid, jsonb, jsonb, text, uuid[]),
  public.admin_restore_revision(uuid, text), public.admin_set_song_deleted(uuid, boolean),
  public.get_revision_content(uuid), public.search_songs(text, uuid[], int) from public;
grant execute on function public.admin_save_song(uuid, jsonb, jsonb, text, uuid[]),
  public.admin_restore_revision(uuid, text), public.admin_set_song_deleted(uuid, boolean) to authenticated;
grant execute on function public.get_revision_content(uuid), public.search_songs(text, uuid[], int) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Default categories (editable by the administrator)
-- -----------------------------------------------------------------------------
insert into public.song_categories (name, slug, kind, sort_order) values
  ('Ingresso', 'ingresso', 'mass_moment', 10),
  ('Atto penitenziale', 'atto-penitenziale', 'mass_moment', 20),
  ('Gloria', 'gloria', 'mass_moment', 30),
  ('Salmo', 'salmo', 'mass_moment', 40),
  ('Alleluia', 'alleluia', 'mass_moment', 50),
  ('Offertorio', 'offertorio', 'mass_moment', 60),
  ('Santo', 'santo', 'mass_moment', 70),
  ('Agnello di Dio', 'agnello-di-dio', 'mass_moment', 80),
  ('Comunione', 'comunione', 'mass_moment', 90),
  ('Ringraziamento', 'ringraziamento', 'mass_moment', 100),
  ('Finale', 'finale', 'mass_moment', 110),
  ('Avvento', 'avvento', 'liturgical_season', 200),
  ('Natale', 'natale', 'liturgical_season', 210),
  ('Quaresima', 'quaresima', 'liturgical_season', 220),
  ('Settimana Santa', 'settimana-santa', 'liturgical_season', 230),
  ('Pasqua', 'pasqua', 'liturgical_season', 240),
  ('Tempo ordinario', 'tempo-ordinario', 'liturgical_season', 250),
  ('Canti mariani', 'canti-mariani', 'theme', 300),
  ('Adorazione', 'adorazione', 'theme', 310),
  ('Animazione dell''oratorio', 'animazione-oratorio', 'theme', 320),
  ('Altre celebrazioni', 'altre-celebrazioni', 'other', 400);
