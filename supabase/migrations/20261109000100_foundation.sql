-- =============================================================================
-- Jubilate — 0100 Foundation
-- Parishes, profiles, roles, director requests, preferences, activity log and
-- the authorization helpers used by every RLS policy.
--
-- Security model (see SECURITY.md):
--   * Every table has RLS enabled and explicit, minimal GRANTs.
--   * Roles live in public.user_roles, never in user-editable metadata.
--   * Role changes happen only through SECURITY DEFINER functions that check
--     the caller is an administrator.
--   * Helpers live in the `private` schema, which is NOT exposed by the Data API.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- Objects created by this role in public must not be implicitly exposed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('director', 'admin');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- -----------------------------------------------------------------------------
-- Text normalization (accents, case, whitespace) used by search.
-- unaccent() is STABLE; this wrapper pins the dictionary so it can be IMMUTABLE
-- and therefore usable in indexes.
-- -----------------------------------------------------------------------------
create or replace function private.normalize_text(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))),
    '[\s[:punct:]’‘“”«»]+', ' ', 'g'))
$$;

-- -----------------------------------------------------------------------------
-- Parishes (single parish today; every scoped row carries parish_id so a second
-- parish can be added without a rewrite).
-- -----------------------------------------------------------------------------
create table public.parishes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(name) between 2 and 160),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index parishes_single_default on public.parishes (is_default) where is_default;

insert into public.parishes (slug, name, is_default, settings)
values ('parrocchia', 'Parrocchia', true,
        jsonb_build_object('chord_notation', 'italian', 'room_ttl_hours', 6));

create or replace function private.default_parish_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.parishes where is_default limit 1
$$;

-- -----------------------------------------------------------------------------
-- Generic updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger parishes_touch before update on public.parishes
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  is_suspended boolean not null default false,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_parish_idx on public.profiles (parish_id);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- New auth user -> profile. Display name comes from signup metadata but is only
-- a cosmetic value: it never grants anything.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Roles. A row means "role granted"; revocation is recorded, not deleted, so the
-- history stays auditable. "Registered user" is implicit (= has a profile).
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create unique index user_roles_active_unique
  on public.user_roles (user_id, parish_id, role) where revoked_at is null;
create index user_roles_user_idx on public.user_roles (user_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- Authorization helpers (used in policies; run once per statement thanks to
-- the `(select ...)` wrapping in policies).
-- -----------------------------------------------------------------------------
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and not p.is_suspended
  )
$$;

create or replace function private.has_role(p_role public.app_role, p_parish uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and not p.is_suspended
    where r.user_id = (select auth.uid())
      and r.revoked_at is null
      and (p_parish is null or r.parish_id = p_parish)
      and (r.role = p_role or r.role = 'admin')   -- admin implies every role
  )
$$;

create or replace function private.is_admin(p_parish uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('admin', p_parish) $$;

create or replace function private.is_director(p_parish uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('director', p_parish) $$;

create or replace function private.require_admin(p_parish uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_parish) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v uuid := (select auth.uid());
begin
  if v is null or not private.is_active_user() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Activity log (append-only, written by SECURITY DEFINER functions/triggers)
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id bigint generated always as identity primary key,
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 2 and 64),
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (parish_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);
create index activity_logs_actor_idx on public.activity_logs (actor_id);

create or replace function private.log_activity(
  p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting primitive (used by room joins and other sensitive RPCs)
-- -----------------------------------------------------------------------------
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup on public.rate_limit_events (user_id, action, created_at desc);

-- Raises 'rate_limited' if the caller has >= p_max events for p_action in p_window.
create or replace function private.check_rate_limit(p_action text, p_max int, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  select count(*) into n from public.rate_limit_events
   where user_id = (select auth.uid()) and action = p_action and created_at > now() - p_window;
  if n >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001', hint = p_action;
  end if;
end;
$$;

create or replace function private.record_rate_event(p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limit_events (user_id, action) values ((select auth.uid()), p_action);
$$;

-- -----------------------------------------------------------------------------
-- Director requests
-- -----------------------------------------------------------------------------
create table public.director_requests (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid not null default private.default_parish_id() references public.parishes (id),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  motivation text not null check (char_length(motivation) between 10 and 2000),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index director_requests_one_pending
  on public.director_requests (user_id, parish_id) where status = 'pending';
create index director_requests_status_idx on public.director_requests (parish_id, status, created_at desc);

create trigger director_requests_touch before update on public.director_requests
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- User preferences (reading settings). One JSON document per user; the shape is
-- validated client-side and bounded here.
-- -----------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 8192),
  updated_at timestamptz not null default now()
);
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function private.touch_updated_at();

-- =============================================================================
-- Privileged RPCs (public schema so the client can call them; each checks the
-- caller server-side).
-- =============================================================================

create or replace function public.request_director_role(p_motivation text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := private.require_user(); v_id uuid;
begin
  if private.is_director(private.default_parish_id()) then
    raise exception 'already_director' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('director_request', 5, interval '1 day');
  perform private.record_rate_event('director_request');
  insert into public.director_requests (user_id, motivation)
  values (v_uid, btrim(p_motivation))
  returning id into v_id;
  perform private.log_activity('director_request.created', 'director_request', v_id);
  return v_id;
exception when unique_violation then
  raise exception 'request_already_pending' using errcode = 'P0001';
end;
$$;

create or replace function public.review_director_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.director_requests;
begin
  select * into r from public.director_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_admin(r.parish_id);
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;

  update public.director_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.request_status,
         reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_request_id;

  if p_approve then
    insert into public.user_roles (user_id, parish_id, role, granted_by)
    values (r.user_id, r.parish_id, 'director', (select auth.uid()))
    on conflict do nothing;
  end if;
  perform private.log_activity(
    case when p_approve then 'director_request.approved' else 'director_request.rejected' end,
    'director_request', p_request_id, jsonb_build_object('user_id', r.user_id));
end;
$$;

create or replace function public.cancel_director_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.director_requests set status = 'cancelled'
   where id = p_request_id and user_id = private.require_user() and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_parish uuid := private.default_parish_id();
begin
  perform private.require_admin(v_parish);
  if not p_grant and p_role = 'admin' and p_user_id = (select auth.uid()) then
    raise exception 'cannot_revoke_own_admin' using errcode = 'P0001';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, parish_id, role, granted_by)
    values (p_user_id, v_parish, p_role, (select auth.uid()))
    on conflict do nothing;
  else
    update public.user_roles set revoked_at = now(), revoked_by = (select auth.uid())
     where user_id = p_user_id and parish_id = v_parish and role = p_role and revoked_at is null;
  end if;
  perform private.log_activity(case when p_grant then 'role.granted' else 'role.revoked' end,
    'profile', p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_suspend_self' using errcode = 'P0001';
  end if;
  update public.profiles set is_suspended = p_suspended,
         suspended_reason = case when p_suspended then nullif(btrim(p_reason), '') end
   where id = p_user_id;
  perform private.log_activity(case when p_suspended then 'user.suspended' else 'user.reinstated' end,
    'profile', p_user_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- Returns the caller's effective roles for the default parish (for the UI only;
-- every protected operation re-checks on the server).
create or replace function public.my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.role), '{}')
  from public.user_roles r
  join public.profiles p on p.id = r.user_id and not p.is_suspended
  where r.user_id = (select auth.uid()) and r.revoked_at is null
    and r.parish_id = private.default_parish_id()
$$;

-- Admin listing of users with e-mail (auth.users is not exposed to clients).
create or replace function public.admin_list_users(p_search text default null)
returns table (id uuid, email text, display_name text, is_suspended boolean,
               roles public.app_role[], created_at timestamptz, email_confirmed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, u.email::text, p.display_name, p.is_suspended,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r
                     where r.user_id = p.id and r.revoked_at is null), '{}'),
           p.created_at, u.email_confirmed_at is not null
      from public.profiles p
      join auth.users u on u.id = p.id
     where p_search is null or p_search = ''
        or private.normalize_text(p.display_name || ' ' || coalesce(u.email, ''))
           like '%' || private.normalize_text(p_search) || '%'
     order by p.created_at desc
     limit 500;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.parishes enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.activity_logs enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.director_requests enable row level security;
alter table public.user_preferences enable row level security;

-- parishes: public name/settings, admin update
create policy parishes_read on public.parishes for select to anon, authenticated using (true);
create policy parishes_admin_update on public.parishes for update to authenticated
  using ((select private.is_admin(id))) with check ((select private.is_admin(id)));

-- profiles: registered users can see display names (director name in rooms,
-- authors of contributions); users edit only their own cosmetic columns.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: read own + admins; NO write policies (writes only via RPC).
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- activity_logs: admins only, read-only.
create policy activity_logs_admin_read on public.activity_logs for select to authenticated
  using ((select private.is_admin(parish_id)));

-- rate_limit_events: no policies => inaccessible to clients.

-- director_requests: own + admin read; status changes only through RPCs.
create policy director_requests_read on public.director_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin(parish_id)));

-- user_preferences: owner only.
create policy user_preferences_own_select on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_preferences_own_insert on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_preferences_own_update on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- =============================================================================
-- Grants (explicit, minimal)
-- =============================================================================
revoke all on public.parishes, public.profiles, public.user_roles, public.activity_logs,
  public.rate_limit_events, public.director_requests, public.user_preferences from anon, authenticated;

grant select on public.parishes to anon, authenticated;
grant update (name, settings) on public.parishes to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.activity_logs to authenticated;
grant select on public.director_requests to authenticated;
grant select, insert, update on public.user_preferences to authenticated;

revoke execute on all functions in schema private from public;
grant execute on function
  private.normalize_text(text),
  private.default_parish_id(),
  private.is_active_user(),
  private.has_role(public.app_role, uuid),
  private.is_admin(uuid),
  private.is_director(uuid)
to anon, authenticated;

revoke execute on function
  public.request_director_role(text),
  public.review_director_request(uuid, boolean, text),
  public.cancel_director_request(uuid),
  public.admin_set_role(uuid, public.app_role, boolean),
  public.admin_set_suspended(uuid, boolean, text),
  public.my_roles(),
  public.admin_list_users(text)
from public, anon;
grant execute on function
  public.request_director_role(text),
  public.review_director_request(uuid, boolean, text),
  public.cancel_director_request(uuid),
  public.admin_set_role(uuid, public.app_role, boolean),
  public.admin_set_suspended(uuid, boolean, text),
  public.my_roles(),
  public.admin_list_users(text)
to authenticated;
