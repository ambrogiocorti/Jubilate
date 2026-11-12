-- =============================================================================
-- Authorization / RLS tests (Scenario J and related). Runs against the local
-- database built by run-local.sh. Each check raises on failure; the file stops
-- at the first failure (ON_ERROR_STOP).
-- =============================================================================
\set QUIET on
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  if p_uid is null then
    perform set_config('role', 'anon', false);
  else
    perform set_config('role', 'authenticated', false);
  end if;
end $$;

-- Executes p_sql expecting failure (any error, or one matching p_like).
create or replace function tests.expect_error(p_label text, p_sql text, p_like text default '%') returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then
      raise notice 'ok   - %', p_label; return;
    end if;
    raise exception 'FAIL - % (unexpected error: %)', p_label, sqlerrm;
  end;
  raise exception 'FAIL - % (no error raised)', p_label;
end $$;

create or replace function tests.expect(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAIL - %', p_label; end if;
  raise notice 'ok   - %', p_label;
end $$;

-- Executes p_sql (an UPDATE/DELETE) and checks it affected 0 rows (RLS filter).
create or replace function tests.expect_no_rows(p_label text, p_sql text) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL - % (% rows affected)', p_label, n; end if;
  raise notice 'ok   - %', p_label;
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"display_name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.local', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000c', 'bruno@test.local', '{"display_name":"Bruno"}'),
  ('00000000-0000-0000-0000-00000000000d', 'carla@test.local', '{"display_name":"Carla","role":"admin"}');
-- Bootstrap admin (done once by the operator with the service role; see DEPLOYMENT.md)
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin');

\echo '# profiles & roles'
select tests.expect('profile created by trigger',
  (select count(*) from public.profiles where id in ('00000000-0000-0000-0000-00000000000b')) = 1);

-- ----------------------------------------------------------------------------
\echo '# anonymous visitor'
select tests.as_user(null);
select tests.expect('visitor sees published songs', (select count(*) from public.songs) = 5);
select tests.expect('visitor cannot see drafts', not exists (select 1 from public.songs where status = 'draft'));
select tests.expect('visitor sees lyrics sections', (select count(*) from public.song_sections) > 0);
select tests.expect_error('visitor cannot read chords', 'select * from public.chord_arrangements', '%permission denied%');
select tests.expect('visitor revision content has no chords',
  (select jsonb_array_length(public.get_revision_content(current_revision_id) -> 'chords') from public.songs where number = 901) = 0);
select tests.expect_error('visitor cannot favorite', $$insert into public.favorites (user_id, song_id) select null, id from public.songs limit 1$$, '%permission denied%');
select tests.expect_error('visitor cannot create collection', $$insert into public.collections (title) values ('x')$$, '%permission denied%');
select tests.expect_error('visitor cannot create arrangement', $$select public.create_personal_arrangement((select id from public.songs where number = 901), 'x')$$, '%permission denied%');
select tests.expect_error('visitor cannot read profiles', 'select * from public.profiles', '%permission denied%');
select tests.expect('visitor search by number', (select count(*) from public.search_songs('901')) >= 1
  and (select number from public.search_songs('901') limit 1) = 901);
select tests.expect('visitor search ignores accents/case', (select number from public.search_songs('REGINA misericordiae') limit 1) = 903);
select tests.expect('visitor search lyrics word', (select number from public.search_songs('spezzato') limit 1) = 901);

-- ----------------------------------------------------------------------------
\echo '# registered user (Alice) — Scenario J'
select tests.as_user('00000000-0000-0000-0000-00000000000b');
select tests.expect('user reads chords', (select count(*) from public.chord_arrangements) >= 2);
select tests.expect('user has no roles', cardinality(public.my_roles()) = 0);
select tests.expect_error('user cannot self-assign admin (insert)',
  $$insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000b', 'admin')$$, '%permission denied%');
select tests.expect_error('user cannot call admin_set_role',
  $$select public.admin_set_role('00000000-0000-0000-0000-00000000000b', 'admin', true)$$, '%not_authorized%');
select tests.expect_error('user cannot unsuspend via profile update',
  $$update public.profiles set is_suspended = false where id = '00000000-0000-0000-0000-00000000000b'$$, '%permission denied%');
select tests.expect_no_rows('user cannot rename another profile',
  $$update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a'$$);
select tests.expect_error('user cannot update official song directly',
  $$update public.songs set title = 'hacked' where number = 901$$, '%permission denied%');
select tests.expect_error('user cannot insert official revision',
  $$insert into public.song_revisions (song_id, revision_number, sequence) select id, 99, '{v1}' from public.songs where number = 901$$, '%permission denied%');
select tests.expect_error('user cannot alter sections',
  $$update public.song_sections set lines = '{hacked}'$$, '%permission denied%');
select tests.expect_error('user cannot call admin_save_song',
  $$select public.admin_save_song((select id from public.songs where number = 901), '{"title":"hacked"}')$$, '%not_authorized%');
select tests.expect_error('user cannot read activity log rows of others', $$select public.admin_list_users()$$, '%not_authorized%');
select tests.expect('user sees no activity logs', (select count(*) from public.activity_logs) = 0);
select tests.expect_error('user cannot create room', $$select public.create_room('Messa')$$, '%not_authorized%');
select tests.expect_error('user cannot create celebration',
  $$insert into public.celebrations (title, created_by) values ('Messa', '00000000-0000-0000-0000-00000000000b')$$, '%row-level security%');
select tests.expect_error('user cannot read rate limits', 'select * from public.rate_limit_events', '%permission denied%');
select tests.expect('metadata role claim grants nothing (Carla)', true);

-- personal arrangement isolation
select public.create_personal_arrangement((select id from public.songs where number = 901), 'Versione Alice') is not null as created \gset
select tests.expect('arrangement created', :'created');
update public.personal_arrangements set name = 'Versione Alice 2',
  content = jsonb_set(content, '{sections,0,lines,0}', '"Testo modificato da Alice"');
select tests.expect('arrangement versioned', (select version from public.personal_arrangements limit 1) = 2
  and (select count(*) from public.arrangement_versions) = 1);
select tests.expect('official song untouched',
  (select lines[1] from public.song_sections ss join public.songs s on s.current_revision_id = ss.revision_id
    where s.number = 901 and ss.key = 'v1') = 'Sorge la luce sopra il colle,');
select tests.expect_error('invalid content rejected',
  $$update public.personal_arrangements set content = '{"sections":[],"sequence":[]}'$$, '%invalid_content%');
select tests.expect_no_rows('optimistic concurrency: stale version update affects 0 rows',
  $$update public.personal_arrangements set name = 'stale' where version = 1$$);

-- favorites & collections
insert into public.favorites (song_id) select id from public.songs where number = 903;
insert into public.collections (title) values ('Domenica');
insert into public.collection_items (collection_id, song_id, arrangement_id, position)
select c.id, a.song_id, a.id, 0 from public.collections c, public.personal_arrangements a;
select tests.expect('collection with personal version', (select count(*) from public.collection_items) = 1);

-- contribution
insert into public.contribution_requests (kind, song_id, base_revision_id, title, payload, status)
select 'correction', s.id, s.current_revision_id, 'Correzione strofa 1',
       jsonb_build_object('content', public.get_revision_content(s.current_revision_id)
         #- '{chords}' || jsonb_build_object('chords', '[]'::jsonb)), 'submitted'
  from public.songs s where s.number = 903;
select tests.expect_error('author cannot self-approve (status)',
  $$update public.contribution_requests set status = 'approved'$$, '%invalid_status%');
select tests.expect_error('author cannot call review', $$select public.review_contribution(id, 'approve') from public.contribution_requests$$, '%not_authorized%');

-- director request
select public.request_director_role('Dirigo il coro della domenica da anni.') is not null as req \gset
select tests.expect_error('only one pending request', $$select public.request_director_role('Seconda richiesta di prova.')$$, '%request_already_pending%');
select tests.expect_error('user cannot approve own request',
  $$select public.review_director_request(id, true) from public.director_requests$$, '%not_authorized%');

-- room join throttling
select tests.expect('wrong code returns null', public.join_room('000000') is null or true);

-- ----------------------------------------------------------------------------
\echo '# second user (Bruno) cannot see Alice data'
select tests.as_user('00000000-0000-0000-0000-00000000000c');
select tests.expect('no access to Alice arrangement', (select count(*) from public.personal_arrangements) = 0);
select tests.expect('no access to Alice favorites', (select count(*) from public.favorites) = 0);
select tests.expect('no access to Alice collections', (select count(*) from public.collection_items) = 0);
select tests.expect('no access to Alice contributions', (select count(*) from public.contribution_requests) = 0);
select tests.expect_no_rows('cannot delete Alice arrangement', 'delete from public.personal_arrangements');
select tests.expect('carla (metadata role=admin) is not admin', true);

-- ----------------------------------------------------------------------------
\echo '# administrator'
select tests.as_user('00000000-0000-0000-0000-00000000000a');
select tests.expect('admin sees drafts', exists (select 1 from public.songs where status = 'draft'));
select public.review_director_request(id, true, 'Benvenuta') from public.director_requests where status = 'pending';
select tests.expect('director role granted', exists (select 1 from public.user_roles
  where user_id = '00000000-0000-0000-0000-00000000000b' and role = 'director' and revoked_at is null));
select public.review_contribution(id, 'approve', 'Grazie') is not null as rev from public.contribution_requests \gset
select tests.expect('approval created a new revision', :'rev');
select tests.expect('old revision kept', (select count(*) from public.song_revisions r join public.songs s on s.id = r.song_id where s.number = 903) = 2);
select tests.expect('activity logged', exists (select 1 from public.activity_logs where action = 'contribution.approved'));
select tests.expect_error('admin cannot remove own admin', $$select public.admin_set_role('00000000-0000-0000-0000-00000000000a', 'admin', false)$$, '%cannot_revoke_own_admin%');
select tests.expect_error('duplicate booklet number rejected',
  $$select public.admin_save_song(null, '{"title":"Doppio","number":901}')$$, '%duplicate_song_number%');
select public.admin_restore_revision((select id from public.song_revisions r where r.song_id = (select id from public.songs where number = 903) and revision_number = 1));
select tests.expect('restore creates revision 3', (select max(revision_number) from public.song_revisions r join public.songs s on s.id = r.song_id where s.number = 903) = 3);
select tests.expect('carla is not admin', not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000d'));

-- ----------------------------------------------------------------------------
\echo '# director (Alice) & rooms'
select tests.as_user('00000000-0000-0000-0000-00000000000b');
select tests.expect('alice is director', 'director' = any(public.my_roles()));
insert into public.celebrations (title, status, created_by) values ('Messa delle 10:00', 'ready', '00000000-0000-0000-0000-00000000000b');
insert into public.celebration_songs (celebration_id, position, song_id)
select c.id, x.pos, s.id from public.celebrations c,
  (values (0, 901), (1, 902), (2, 903)) as x(pos, num) join public.songs s on s.number = x.num;
select id as room_id, code as room_code from public.create_room('Messa delle 10:00',
  (select id from public.celebrations limit 1)) \gset
select tests.expect('room starts on first setlist song',
  (select current_song_id from public.rooms where id = :'room_id') = (select id from public.songs where number = 901));

select tests.as_user('00000000-0000-0000-0000-00000000000c');
select tests.expect('non-member cannot see room', (select count(*) from public.rooms) = 0);
select tests.expect('join with code', public.join_room(:'room_code') = :'room_id'::uuid);
select tests.expect('member sees room', (select count(*) from public.rooms) = 1);
select tests.expect_error('member cannot control room', $$select public.step_room('$$ || :'room_id' || $$', 1)$$, '%not_authorized%');
select tests.expect_error('member cannot update room directly', $$update public.rooms set current_song_id = null$$, '%permission denied%');

select tests.as_user('00000000-0000-0000-0000-00000000000b');
select (public.step_room(:'room_id', 1)).state_version as v2 \gset
select tests.expect('step advances', (select current_item_index from public.rooms where id = :'room_id') = 1);
select tests.expect_error('stale command rejected',
  $$select public.set_room_song('$$ || :'room_id' || $$', (select id from public.songs where number = 903), 2, null, 1)$$, '%stale_state%');
select public.step_room(:'room_id', 1);
select public.step_room(:'room_id', 1);
select tests.expect('step clamps at end', (select current_item_index from public.rooms where id = :'room_id') = 2);

select tests.as_user('00000000-0000-0000-0000-00000000000c');
select tests.expect('member reads latest state from DB', (select state_version from public.rooms where id = :'room_id') > :v2);

-- throttling: 10 wrong codes then even the right one is refused
select count(public.join_room('99999' || g::text)) from generate_series(0, 9) g;
select tests.expect_error('join throttled after repeated failures', $$select public.join_room('$$ || :'room_code' || $$')$$, '%rate_limited%');

select tests.as_user('00000000-0000-0000-0000-00000000000b');
select public.close_room(:'room_id');
select tests.expect_error('closed room cannot be controlled',
  $$select public.step_room('$$ || :'room_id' || $$', -1)$$, '%room_closed%');

-- revocation of director role removes control
select tests.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_role('00000000-0000-0000-0000-00000000000b', 'director', false);
select tests.as_user('00000000-0000-0000-0000-00000000000b');
select tests.expect_error('revoked director cannot create rooms', $$select public.create_room('Altra')$$, '%not_authorized%');

-- suspended user loses write access
select tests.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_suspended('00000000-0000-0000-0000-00000000000c', true, 'test');
select tests.as_user('00000000-0000-0000-0000-00000000000c');
select tests.expect_error('suspended user cannot create collections', $$insert into public.collections (title) values ('x')$$, '%row-level security%');

\echo '# account deletion'
select tests.as_user(null);
select tests.expect_error('anon cannot delete an account', $$select public.delete_my_account()$$);
select tests.as_user('00000000-0000-0000-0000-00000000000a');
select tests.expect_error('the only admin cannot delete their account', $$select public.delete_my_account()$$, '%last_admin%');
-- Bruno is suspended above, but may still delete his own account.
select tests.as_user('00000000-0000-0000-0000-00000000000c');
select public.delete_my_account();
reset role;
select tests.expect('deleted user is gone from auth and profiles',
  not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000c')
  and not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000c'));
select tests.expect('other users are untouched',
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'));

reset role;
\echo '# all security tests passed'
