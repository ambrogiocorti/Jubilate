-- =============================================================================
-- Jubilate — 0400 Favorites, collections, community contributions
-- =============================================================================

create type public.contribution_kind as enum
  ('new_song', 'correction', 'chords', 'metadata', 'arrangement', 'score', 'recording');
create type public.contribution_status as enum ('draft', 'submitted', 'in_review', 'approved', 'rejected');
create type public.collection_kind as enum ('personal', 'celebration', 'rehearsal');

-- -----------------------------------------------------------------------------
-- Favorites
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index favorites_song_idx on public.favorites (song_id);

-- -----------------------------------------------------------------------------
-- Collections
-- -----------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  kind public.collection_kind not null default 'personal',
  celebration_id uuid,               -- FK added in 0500
  visibility public.share_visibility not null default 'private',
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'link') = (share_token is not null))
);
create index collections_owner_idx on public.collections (owner_id, updated_at desc);
create trigger collections_touch before update on public.collections
  for each row execute function private.touch_updated_at();

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  arrangement_id uuid references public.personal_arrangements (id) on delete set null,
  position int not null check (position >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index collection_items_collection_idx on public.collection_items (collection_id, position);
create index collection_items_song_idx on public.collection_items (song_id);
create index collection_items_arrangement_idx on public.collection_items (arrangement_id);

create or replace function private.owns_collection(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.collections c where c.id = p_id and c.owner_id = (select auth.uid())) $$;
grant execute on function private.owns_collection(uuid) to authenticated;

-- An item may reference a personal arrangement only if the collection owner can read it.
create or replace function private.collection_items_check()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.arrangement_id is not null and not private.can_read_arrangement(new.arrangement_id) then
    raise exception 'arrangement_not_accessible' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger collection_items_bw before insert or update on public.collection_items
  for each row execute function private.collection_items_check();

create or replace function public.duplicate_collection(p_id uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); c public.collections; v_id uuid;
begin
  select * into c from public.collections where id = p_id and owner_id = v_uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.collections (owner_id, title, description, kind)
  values (v_uid, coalesce(nullif(btrim(p_title), ''), c.title || ' (copia)'), c.description, c.kind)
  returning id into v_id;
  insert into public.collection_items (collection_id, song_id, arrangement_id, position, note)
  select v_id, song_id, arrangement_id, position, note from public.collection_items where collection_id = p_id;
  return v_id;
end;
$$;

create or replace function public.set_collection_link_sharing(p_id uuid, p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  if not exists (select 1 from public.collections where id = p_id and owner_id = private.require_user()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_token := case when p_enabled then encode(extensions.gen_random_bytes(18), 'hex') end;
  update public.collections set share_token = v_token,
         visibility = case when p_enabled then 'link' else 'private' end::public.share_visibility
   where id = p_id;
  return v_token;
end;
$$;

-- Shared collections expose only published official songs (personal arrangements
-- in a shared collection are referenced by id; their content stays private
-- unless shared separately).
create or replace function public.get_shared_collection(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'owner_name', p.display_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'song_id', s.id, 'number', s.number, 'title', s.title, 'note', i.note) order by i.position)
              from public.collection_items i join public.songs s on s.id = i.song_id
              where i.collection_id = c.id and s.status = 'published' and s.deleted_at is null), '[]'::jsonb))
  from public.collections c join public.profiles p on p.id = c.owner_id
  where c.visibility = 'link' and c.share_token = p_token and length(p_token) >= 32
$$;

-- -----------------------------------------------------------------------------
-- Contributions (proposals reviewed by the administrator)
-- payload: { "metadata"?: {...}, "content"?: SongContent, "musicxml"?: text,
--            "score_title"?: text, "instrument"?: text, "media_asset_id"?: uuid,
--            "arrangement_id"?: uuid, "category_ids"?: [uuid] }
-- -----------------------------------------------------------------------------
create table public.contribution_requests (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.contribution_kind not null,
  song_id uuid references public.songs (id) on delete cascade,
  base_revision_id uuid references public.song_revisions (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  message text check (message is null or char_length(message) <= 4000),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 6 * 1024 * 1024),
  status public.contribution_status not null default 'draft',
  reviewer_id uuid references public.profiles (id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewed_at timestamptz,
  resulting_revision_id uuid references public.song_revisions (id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'new_song' or song_id is not null)
);
create index contribution_requests_author_idx on public.contribution_requests (author_id, created_at desc);
create index contribution_requests_queue_idx on public.contribution_requests (parish_id, status, submitted_at);
create index contribution_requests_song_idx on public.contribution_requests (song_id);
create index contribution_requests_base_idx on public.contribution_requests (base_revision_id);
create index contribution_requests_result_idx on public.contribution_requests (resulting_revision_id);
create index contribution_requests_reviewer_idx on public.contribution_requests (reviewer_id);
create trigger contribution_requests_touch before update on public.contribution_requests
  for each row execute function private.touch_updated_at();

alter table public.song_revisions add constraint song_revisions_contribution_fk
  foreign key (contribution_id) references public.contribution_requests (id) on delete set null;
create index song_revisions_contribution_idx on public.song_revisions (contribution_id);

-- Authors can only move their proposal between draft and submitted.
create or replace function private.contributions_author_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_admin(new.parish_id) then return new; end if;
  if tg_op = 'UPDATE' and old.status not in ('draft', 'submitted') then
    raise exception 'contribution_locked' using errcode = '42501';
  end if;
  if new.status not in ('draft', 'submitted') then
    raise exception 'invalid_status' using errcode = '42501';
  end if;
  if new.payload ? 'content' then perform private.validate_song_content(new.payload -> 'content'); end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    new.submitted_at := now();
  end if;
  new.reviewer_id := case when tg_op = 'UPDATE' then old.reviewer_id end;
  new.review_note := case when tg_op = 'UPDATE' then old.review_note end;
  new.resulting_revision_id := case when tg_op = 'UPDATE' then old.resulting_revision_id end;
  return new;
end;
$$;
create trigger contribution_requests_guard before insert or update on public.contribution_requests
  for each row execute function private.contributions_author_guard();

create or replace function public.review_contribution(
  p_id uuid, p_decision text, p_note text default null, p_force boolean default false)
returns uuid  -- resulting revision (if any)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contribution_requests; v_song uuid; v_rev uuid; v_current uuid; v_meta jsonb; v_score uuid;
begin
  select * into c from public.contribution_requests where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_admin(c.parish_id);
  if c.status not in ('submitted', 'in_review') then
    raise exception 'contribution_not_reviewable' using errcode = 'P0001';
  end if;

  if p_decision = 'in_review' then
    update public.contribution_requests set status = 'in_review', reviewer_id = (select auth.uid()) where id = p_id;
    return null;
  elsif p_decision = 'reject' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.contribution_requests
       set status = 'rejected', reviewer_id = (select auth.uid()), review_note = btrim(p_note), reviewed_at = now()
     where id = p_id;
    perform private.log_activity('contribution.rejected', 'contribution', p_id);
    return null;
  elsif p_decision <> 'approve' then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  v_meta := coalesce(c.payload -> 'metadata', '{}'::jsonb);
  v_song := c.song_id;

  if c.kind = 'new_song' then
    v_song := public.admin_save_song(null, v_meta || jsonb_build_object('status', 'published'),
                                     c.payload -> 'content', coalesce(p_note, c.title),
                                     case when c.payload ? 'category_ids' then
                                       array(select jsonb_array_elements_text(c.payload -> 'category_ids')::uuid) end);
    select current_revision_id into v_rev from public.songs where id = v_song;
  elsif c.kind in ('correction', 'chords', 'metadata', 'arrangement') then
    select current_revision_id into v_current from public.songs where id = v_song for update;
    if c.base_revision_id is not null and c.base_revision_id is distinct from v_current and not p_force then
      raise exception 'conflict_outdated_base' using errcode = 'P0001',
        hint = 'La versione ufficiale è cambiata dopo la proposta: confrontare e confermare.';
    end if;
    perform public.admin_save_song(v_song, v_meta, c.payload -> 'content', coalesce(p_note, c.title), null);
    select current_revision_id into v_rev from public.songs where id = v_song;
    if v_rev is not distinct from v_current then v_rev := null; end if;
  elsif c.kind = 'score' then
    if coalesce(c.payload ->> 'musicxml', '') = '' then raise exception 'missing_musicxml' using errcode = '22023'; end if;
    insert into public.music_scores (parish_id, song_id, owner_id, title, instrument, status, source, created_by)
    values (c.parish_id, v_song, null, coalesce(c.payload ->> 'score_title', c.title),
            coalesce(nullif(c.payload ->> 'instrument', ''), 'piano')::public.instrument, 'published',
            'Contributo della comunità', c.author_id)
    returning id into v_score;
    insert into public.score_versions (score_id, musicxml, note, created_by)
    values (v_score, c.payload ->> 'musicxml', c.title, c.author_id);
  elsif c.kind = 'recording' then
    update public.media_assets set status = 'published'
     where id = (c.payload ->> 'media_asset_id')::uuid and parish_id = c.parish_id;
    if not found then raise exception 'media_not_found' using errcode = 'P0002'; end if;
  end if;

  if v_rev is not null then
    update public.song_revisions set contribution_id = p_id where id = v_rev;
  end if;
  update public.contribution_requests
     set status = 'approved', reviewer_id = (select auth.uid()), review_note = nullif(btrim(p_note), ''),
         reviewed_at = now(), resulting_revision_id = v_rev, song_id = v_song
   where id = p_id;
  perform private.log_activity('contribution.approved', 'contribution', p_id,
    jsonb_build_object('song_id', v_song, 'revision_id', v_rev, 'forced', p_force));
  return v_rev;
end;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.favorites enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.contribution_requests enable row level security;

create policy favorites_own_select on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_own_insert on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and private.song_is_public(song_id));
create policy favorites_own_delete on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create policy collections_own_select on public.collections for select to authenticated using (owner_id = (select auth.uid()));
create policy collections_own_insert on public.collections for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_active_user()));
create policy collections_own_update on public.collections for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy collections_own_delete on public.collections for delete to authenticated using (owner_id = (select auth.uid()));

create policy collection_items_select on public.collection_items for select to authenticated
  using (private.owns_collection(collection_id));
create policy collection_items_insert on public.collection_items for insert to authenticated
  with check (private.owns_collection(collection_id));
create policy collection_items_update on public.collection_items for update to authenticated
  using (private.owns_collection(collection_id)) with check (private.owns_collection(collection_id));
create policy collection_items_delete on public.collection_items for delete to authenticated
  using (private.owns_collection(collection_id));

create policy contributions_read on public.contribution_requests for select to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin(parish_id)));
create policy contributions_insert on public.contribution_requests for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.is_active_user()));
create policy contributions_update on public.contribution_requests for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy contributions_delete on public.contribution_requests for delete to authenticated
  using (author_id = (select auth.uid()) and status = 'draft');

revoke all on public.favorites, public.collections, public.collection_items, public.contribution_requests from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, delete on public.collections to authenticated;
grant insert (title, description, kind, celebration_id) on public.collections to authenticated;
grant update (title, description, kind, celebration_id) on public.collections to authenticated;
grant select, insert, update, delete on public.collection_items to authenticated;
grant select, delete on public.contribution_requests to authenticated;
grant insert (kind, song_id, base_revision_id, title, message, payload, status) on public.contribution_requests to authenticated;
grant update (title, message, payload, status, base_revision_id) on public.contribution_requests to authenticated;

revoke execute on function public.duplicate_collection(uuid, text), public.set_collection_link_sharing(uuid, boolean),
  public.get_shared_collection(text), public.review_contribution(uuid, text, text, boolean) from public;
grant execute on function public.duplicate_collection(uuid, text), public.set_collection_link_sharing(uuid, boolean),
  public.review_contribution(uuid, text, text, boolean) to authenticated;
grant execute on function public.get_shared_collection(text) to anon, authenticated;
