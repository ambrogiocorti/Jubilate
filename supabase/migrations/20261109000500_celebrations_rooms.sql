-- =============================================================================
-- Jubilate — 0500 Celebrations, rehearsals and live rooms
--
-- Rooms: the database row is the AUTHORITATIVE live state (current song,
-- monotonically increasing state_version). Realtime change events only notify
-- clients quickly; clients always re-read the row on (re)connect, on "Torna
-- alla diretta" and when the tab becomes visible, and discard events whose
-- state_version is not newer than the one they hold (no duplicates, no
-- out-of-order regressions).
--
-- Membership (room_memberships) is independent of the client navigation mode
-- (FOLLOWING_LIVE / BROWSING_FREELY), which is purely local: browsing never
-- leaves the room.
-- =============================================================================

create type public.celebration_kind as enum ('mass', 'adoration', 'vigil', 'rehearsal', 'other');
create type public.celebration_status as enum ('draft', 'ready', 'done', 'cancelled');
create type public.room_status as enum ('active', 'closed');

create table public.celebrations (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  kind public.celebration_kind not null default 'mass',
  title text not null check (char_length(btrim(title)) between 2 and 160),
  starts_at timestamptz,
  description text check (description is null or char_length(description) <= 2000),
  notes text check (notes is null or char_length(notes) <= 4000),
  director_id uuid references public.profiles (id) on delete set null default auth.uid(),
  status public.celebration_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index celebrations_parish_date_idx on public.celebrations (parish_id, starts_at desc);
create index celebrations_director_idx on public.celebrations (director_id);
create index celebrations_created_by_idx on public.celebrations (created_by);
create trigger celebrations_touch before update on public.celebrations
  for each row execute function private.touch_updated_at();

create table public.celebration_songs (
  id uuid primary key default gen_random_uuid(),
  celebration_id uuid not null references public.celebrations (id) on delete cascade,
  position int not null check (position >= 0),
  moment_label text check (moment_label is null or char_length(moment_label) <= 80),
  category_id uuid references public.song_categories (id) on delete set null,
  song_id uuid not null references public.songs (id) on delete cascade,
  arrangement_id uuid references public.personal_arrangements (id) on delete set null,
  score_id uuid references public.music_scores (id) on delete set null,
  suggested_key text check (suggested_key is null or suggested_key ~ '^[A-G](#|b)?m?$'),
  notes text check (notes is null or char_length(notes) <= 1000)
);
create index celebration_songs_celebration_idx on public.celebration_songs (celebration_id, position);
create index celebration_songs_song_idx on public.celebration_songs (song_id);
create index celebration_songs_category_idx on public.celebration_songs (category_id);
create index celebration_songs_arrangement_idx on public.celebration_songs (arrangement_id);
create index celebration_songs_score_idx on public.celebration_songs (score_id);

alter table public.collections add constraint collections_celebration_fk
  foreign key (celebration_id) references public.celebrations (id) on delete set null;
create index collections_celebration_idx on public.collections (celebration_id);

-- Rehearsal notes: director notes (shared) or personal annotations.
create table public.rehearsal_notes (
  id uuid primary key default gen_random_uuid(),
  celebration_id uuid not null references public.celebrations (id) on delete cascade,
  song_id uuid references public.songs (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  is_shared boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rehearsal_notes_celebration_idx on public.rehearsal_notes (celebration_id);
create index rehearsal_notes_author_idx on public.rehearsal_notes (author_id);
create index rehearsal_notes_song_idx on public.rehearsal_notes (song_id);
create trigger rehearsal_notes_touch before update on public.rehearsal_notes
  for each row execute function private.touch_updated_at();

create or replace function private.can_manage_celebration(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.celebrations c where c.id = p_id
                  and ((private.is_director(c.parish_id) and (c.director_id = (select auth.uid()) or c.created_by = (select auth.uid())))
                       or private.is_admin(c.parish_id)))
$$;
create or replace function private.can_read_celebration(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.celebrations c where c.id = p_id
                  and (c.status <> 'draft' or private.can_manage_celebration(c.id)))
$$;
grant execute on function private.can_manage_celebration(uuid), private.can_read_celebration(uuid) to authenticated;

create or replace function public.duplicate_celebration(p_id uuid, p_title text default null, p_starts_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.celebrations; v_id uuid;
begin
  perform private.require_user();
  if not private.is_director() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.can_read_celebration(p_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from public.celebrations where id = p_id;
  insert into public.celebrations (parish_id, kind, title, starts_at, description, notes, director_id, status, created_by)
  values (c.parish_id, c.kind, coalesce(nullif(btrim(p_title), ''), c.title || ' (copia)'), p_starts_at,
          c.description, c.notes, (select auth.uid()), 'draft', (select auth.uid()))
  returning id into v_id;
  insert into public.celebration_songs (celebration_id, position, moment_label, category_id, song_id, score_id, suggested_key, notes)
  select v_id, position, moment_label, category_id, song_id, score_id, suggested_key, notes
    from public.celebration_songs where celebration_id = p_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rooms
-- -----------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  code char(6) not null check (code ~ '^[0-9]{6}$'),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  director_id uuid not null references public.profiles (id) on delete cascade,
  celebration_id uuid references public.celebrations (id) on delete set null,
  status public.room_status not null default 'active',
  current_song_id uuid references public.songs (id) on delete set null,
  current_arrangement_id uuid references public.personal_arrangements (id) on delete set null,
  current_item_index int,
  state_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz
);
-- A code is unique among active rooms only (codes are recycled after closing).
create unique index rooms_active_code_unique on public.rooms (code) where status = 'active';
create index rooms_director_idx on public.rooms (director_id, created_at desc);
create index rooms_celebration_idx on public.rooms (celebration_id);
create index rooms_current_song_idx on public.rooms (current_song_id);
create index rooms_current_arrangement_idx on public.rooms (current_arrangement_id);

create table public.room_memberships (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (room_id, user_id)
);
create index room_memberships_user_idx on public.room_memberships (user_id);

create or replace function private.room_is_live(r public.rooms)
returns boolean language sql stable set search_path = ''
as $$ select r.status = 'active' and r.expires_at > now() $$;

create or replace function private.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.room_memberships m
                  where m.room_id = p_room and m.user_id = (select auth.uid()) and m.revoked_at is null)
$$;
create or replace function private.can_control_room(p_room uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.rooms r where r.id = p_room
                  and ((r.director_id = (select auth.uid()) and private.is_director(r.parish_id))
                       or private.is_admin(r.parish_id)))
$$;
grant execute on function private.is_room_member(uuid), private.can_control_room(uuid) to authenticated;

-- Cryptographically random 6-digit code, retried until unique among active rooms.
create or replace function private.generate_room_code()
returns char(6) language plpgsql volatile security definer set search_path = ''
as $$
declare v char(6); i int := 0;
begin
  loop
    v := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.rooms where code = v and status = 'active');
    i := i + 1;
    if i > 20 then raise exception 'code_generation_failed'; end if;
  end loop;
  return v;
end;
$$;

-- Lazily close expired rooms (also callable by a scheduled job).
create or replace function private.close_expired_rooms()
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update public.rooms set status = 'closed', closed_at = now(), state_version = state_version + 1, updated_at = now()
   where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.create_room(p_title text, p_celebration_id uuid default null, p_ttl_hours int default null)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); v_parish uuid := private.default_parish_id(); r public.rooms;
        v_ttl int; v_first uuid;
begin
  if not private.is_director(v_parish) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform private.check_rate_limit('room_create', 20, interval '1 hour');
  perform private.record_rate_event('room_create');
  perform private.close_expired_rooms();
  if p_celebration_id is not null and not private.can_read_celebration(p_celebration_id) then
    raise exception 'celebration_not_found' using errcode = 'P0002';
  end if;
  v_ttl := least(greatest(coalesce(p_ttl_hours,
             (select (settings ->> 'room_ttl_hours')::int from public.parishes where id = v_parish), 6), 1), 24);
  if p_celebration_id is not null then
    select song_id into v_first from public.celebration_songs where celebration_id = p_celebration_id order by position limit 1;
  end if;
  insert into public.rooms (parish_id, code, title, director_id, celebration_id, expires_at,
                            current_song_id, current_item_index)
  values (v_parish, private.generate_room_code(), btrim(p_title), v_uid, p_celebration_id,
          now() + make_interval(hours => v_ttl), v_first, case when v_first is not null then 0 end)
  returning * into r;
  insert into public.room_memberships (room_id, user_id) values (r.id, v_uid);
  perform private.log_activity('room.created', 'room', r.id, jsonb_build_object('title', r.title));
  return r;
end;
$$;

-- Joining by code: authenticated users only; repeated wrong codes are throttled
-- (10 failures / 15 min per user, plus a global per-user cap on attempts).
create or replace function public.join_room(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); r public.rooms; m public.room_memberships;
begin
  perform private.check_rate_limit('room_join_fail', 10, interval '15 minutes');
  perform private.check_rate_limit('room_join', 60, interval '15 minutes');
  perform private.record_rate_event('room_join');
  perform private.close_expired_rooms();

  select * into r from public.rooms
   where code = btrim(coalesce(p_code, '')) and status = 'active' and expires_at > now();
  if not found then
    -- No exception here: it would roll back the failure record and defeat the
    -- throttling. NULL means "no active room with this code".
    perform private.record_rate_event('room_join_fail');
    return null;
  end if;

  select * into m from public.room_memberships where room_id = r.id and user_id = v_uid;
  if found and m.revoked_at is not null then
    raise exception 'membership_revoked' using errcode = '42501';
  end if;
  insert into public.room_memberships (room_id, user_id) values (r.id, v_uid)
  on conflict (room_id, user_id) do update set last_seen_at = now();
  return r.id;
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.room_memberships
   where room_id = p_room_id and user_id = (select auth.uid())
     and not exists (select 1 from public.rooms r where r.id = p_room_id and r.director_id = (select auth.uid()));
$$;

create or replace function public.touch_room_membership(p_room_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.room_memberships set last_seen_at = now()
   where room_id = p_room_id and user_id = (select auth.uid()) and revoked_at is null;
$$;

-- Director control. p_expected_version (optional) rejects stale commands, e.g.
-- from a second director device that has not seen the latest change.
create or replace function public.set_room_song(
  p_room_id uuid, p_song_id uuid, p_item_index int default null,
  p_arrangement_id uuid default null, p_expected_version bigint default null)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare r public.rooms;
begin
  perform private.require_user();
  select * into r from public.rooms where id = p_room_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.can_control_room(p_room_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.room_is_live(r) then raise exception 'room_closed' using errcode = 'P0001'; end if;
  if p_expected_version is not null and p_expected_version <> r.state_version then
    raise exception 'stale_state' using errcode = 'P0001', hint = r.state_version::text;
  end if;
  if not private.song_is_public(p_song_id) then raise exception 'song_not_found' using errcode = 'P0002'; end if;
  if p_arrangement_id is not null and not exists (
       select 1 from public.personal_arrangements a where a.id = p_arrangement_id and a.song_id = p_song_id
         and a.owner_id = (select auth.uid())) then
    raise exception 'arrangement_not_accessible' using errcode = '42501';
  end if;

  update public.rooms
     set current_song_id = p_song_id, current_item_index = p_item_index,
         current_arrangement_id = p_arrangement_id,
         state_version = state_version + 1, updated_at = now()
   where id = p_room_id
  returning * into r;
  return r;
end;
$$;

-- Moves along the celebration's song list (+1 / -1).
create or replace function public.step_room(p_room_id uuid, p_delta int)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare r public.rooms; v_count int; v_idx int; v_song uuid;
begin
  select * into r from public.rooms where id = p_room_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.celebration_id is null then raise exception 'no_setlist' using errcode = 'P0001'; end if;
  select count(*) into v_count from public.celebration_songs where celebration_id = r.celebration_id;
  if v_count = 0 then raise exception 'no_setlist' using errcode = 'P0001'; end if;
  v_idx := least(greatest(coalesce(r.current_item_index, -1) + sign(p_delta)::int, 0), v_count - 1);
  select song_id into v_song from public.celebration_songs
   where celebration_id = r.celebration_id order by position offset v_idx limit 1;
  return public.set_room_song(p_room_id, v_song, v_idx, null, null);
end;
$$;

create or replace function public.close_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not private.can_control_room(p_room_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.rooms set status = 'closed', closed_at = now(), state_version = state_version + 1, updated_at = now()
   where id = p_room_id and status = 'active';
  perform private.log_activity('room.closed', 'room', p_room_id);
end;
$$;

create or replace function public.revoke_room_member(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not private.can_control_room(p_room_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.room_memberships set revoked_at = now() where room_id = p_room_id and user_id = p_user_id;
end;
$$;

-- Participant count for the director dashboard.
create or replace function public.room_participants(p_room_id uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz, last_seen_at timestamptz, revoked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_control_room(p_room_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query select m.user_id, p.display_name, m.joined_at, m.last_seen_at, m.revoked_at is not null
    from public.room_memberships m join public.profiles p on p.id = m.user_id
   where m.room_id = p_room_id order by m.joined_at;
end;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.celebrations enable row level security;
alter table public.celebration_songs enable row level security;
alter table public.rehearsal_notes enable row level security;
alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;

create policy celebrations_read on public.celebrations for select to authenticated
  using (status <> 'draft' or private.can_manage_celebration(id));
create policy celebrations_insert on public.celebrations for insert to authenticated
  with check ((select private.is_director(parish_id)) and created_by = (select auth.uid()));
create policy celebrations_update on public.celebrations for update to authenticated
  using (private.can_manage_celebration(id)) with check ((select private.is_director(parish_id)));
create policy celebrations_delete on public.celebrations for delete to authenticated
  using (private.can_manage_celebration(id));

create policy celebration_songs_read on public.celebration_songs for select to authenticated
  using (private.can_read_celebration(celebration_id));
create policy celebration_songs_insert on public.celebration_songs for insert to authenticated
  with check (private.can_manage_celebration(celebration_id));
create policy celebration_songs_update on public.celebration_songs for update to authenticated
  using (private.can_manage_celebration(celebration_id)) with check (private.can_manage_celebration(celebration_id));
create policy celebration_songs_delete on public.celebration_songs for delete to authenticated
  using (private.can_manage_celebration(celebration_id));

create policy rehearsal_notes_read on public.rehearsal_notes for select to authenticated
  using (author_id = (select auth.uid()) or (is_shared and private.can_read_celebration(celebration_id)));
create policy rehearsal_notes_insert on public.rehearsal_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_read_celebration(celebration_id)
              and (not is_shared or private.can_manage_celebration(celebration_id)));
create policy rehearsal_notes_update on public.rehearsal_notes for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and (not is_shared or private.can_manage_celebration(celebration_id)));
create policy rehearsal_notes_delete on public.rehearsal_notes for delete to authenticated
  using (author_id = (select auth.uid()) or private.can_manage_celebration(celebration_id));

-- Rooms are readable only by members and controllers. There is NO policy that
-- allows looking a room up by code: joining goes through join_room().
create policy rooms_read on public.rooms for select to authenticated
  using (private.is_room_member(id) or private.can_control_room(id));

create policy room_memberships_read on public.room_memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.can_control_room(room_id));

revoke all on public.celebrations, public.celebration_songs, public.rehearsal_notes,
  public.rooms, public.room_memberships from anon, authenticated;
grant select, insert, update, delete on public.celebrations, public.celebration_songs to authenticated;
grant select, delete on public.rehearsal_notes to authenticated;
grant insert (celebration_id, song_id, is_shared, body) on public.rehearsal_notes to authenticated;
grant update (body, is_shared) on public.rehearsal_notes to authenticated;
grant select on public.rooms, public.room_memberships to authenticated;

revoke execute on function public.duplicate_celebration(uuid, text, timestamptz), public.create_room(text, uuid, int),
  public.join_room(text), public.leave_room(uuid), public.touch_room_membership(uuid),
  public.set_room_song(uuid, uuid, int, uuid, bigint), public.step_room(uuid, int), public.close_room(uuid),
  public.revoke_room_member(uuid, uuid), public.room_participants(uuid) from public, anon;
grant execute on function public.duplicate_celebration(uuid, text, timestamptz), public.create_room(text, uuid, int),
  public.join_room(text), public.leave_room(uuid), public.touch_room_membership(uuid),
  public.set_room_song(uuid, uuid, int, uuid, bigint), public.step_room(uuid, int), public.close_room(uuid),
  public.revoke_room_member(uuid, uuid), public.room_participants(uuid) to authenticated;

-- Realtime notifications (RLS still applies to postgres_changes subscribers).
alter publication supabase_realtime add table public.rooms;
