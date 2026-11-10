-- Checks for shared projects: invites, roles, saves into someone else's project, search, leaving,
-- removing, OAuth limits and account deletion. Runs after test.sql (user 1 owns p1, user 2 owns p2).
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000003');
update auth.users set email = 'u' || right(id::text, 1) || '@example.com';

create function pg_temp.as_user(n int, oauth boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000' || n, 'role', 'authenticated',
    'client_id', case when oauth then '9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d' end)::text, false)
$$;
grant execute on function pg_temp.as_user(int, boolean) to authenticated;

set role authenticated;

-- ── user 1 makes invite links for p1; nobody else can ──
select pg_temp.as_user(1);
create temp table links (role text, token text);
grant all on links to authenticated;
insert into links select role, token from public.create_project_invite('p1', 'editor');
insert into links select role, token from public.create_project_invite('p1', 'viewer');
do $$
begin
  assert (select count(*) from public.project_invites) = 2, 'owner sees their invites';
  assert (select length(token) from links where role = 'editor') = 64, 'token is 64 hex chars';
end $$;

select pg_temp.as_user(2);
do $$
begin
  perform public.create_project_invite('p1', 'editor');
  raise exception 'non-owner made an invite';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  assert (select count(*) from public.project_invites) = 0, 'invites are private to the owner';
  assert not exists (select 1 from public.projects where id = 'p1'), 'not a member yet';
end $$;

-- ── user 2 joins as editor, user 3 as viewer ──
do $$
declare r record;
begin
  select * into r from public.preview_project_invite((select token from links where role = 'editor'));
  assert r.project_name = 'Tidepool 2' and r.owner_email = 'u1@example.com' and r.role = 'editor' and r.my_role is null,
    format('preview: %s', r);
  assert not exists (select 1 from public.preview_project_invite('nope')), 'unknown link previews nothing';
  select * into r from public.accept_project_invite((select token from links where role = 'editor'));
  assert r.role = 'editor' and r.project_id = 'p1', 'accepted as editor';
  -- a viewer link never lowers an editor
  select * into r from public.accept_project_invite((select token from links where role = 'viewer'));
  assert r.role = 'editor', 'joining again keeps the higher role: ' || r.role;
  assert (select my_role from public.preview_project_invite((select token from links where role = 'viewer'))) = 'editor', 'preview knows the role';
end $$;

select pg_temp.as_user(3);
select public.accept_project_invite((select token from links where role = 'viewer'));

-- ── editor: reads and writes p1, deletes its assets, not the project ──
select pg_temp.as_user(2);
do $$
declare r record; n int; ids text;
begin
  assert exists (select 1 from public.projects where id = 'p1'), 'editor reads the project';
  assert (select count(*) from public.assets where project_id = 'p1') > 5, 'editor reads its assets';
  assert (select count(*) from public.assets where project_id = 'p2') = 1, 'editor still reads their own project';
  select * into r from public.my_shared_projects();
  assert r.owner_id = '00000000-0000-0000-0000-000000000001' and r.role = 'editor' and r.owner_email = 'u1@example.com', 'my_shared_projects';
  select string_agg(email || ':' || role, ',' order by role) into ids
    from public.list_project_members('00000000-0000-0000-0000-000000000001', 'p1');
  assert ids = 'u2@example.com:editor,u1@example.com:owner,u3@example.com:viewer', 'member list: ' || ids;

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 's1', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 's1', 'title', 'Shared note from user two'))));
  assert r.status = 'ok' and r.rev = 1, 'editor adds an asset: ' || r.status;
  assert (select user_id from public.assets where id = 's1') = '00000000-0000-0000-0000-000000000001', 'filed under the owner';
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes',
    'rev', (select rev from public.assets where id = 'n1'), 'data', jsonb_build_object('id', 'n1', 'title', 'Edited by user two'))));
  assert r.status = 'ok', 'editor edits an asset: ' || r.status;
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'i13', 'project_id', 'p1', 'collection', 'issues',
    'data', jsonb_build_object('id', 'i13', 'key', 'TIDE-9'))));
  assert r.status = 'duplicate', 'issue keys stay unique across members: ' || r.status;
  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p1', 'name', 'Tidepool 3',
    'rev', (select rev from public.projects where id = 'p1'), 'data', jsonb_build_object('id', 'p1', 'name', 'Tidepool 3'))));
  assert r.status = 'ok', 'editor renames the project: ' || r.status;
  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p1', 'name', 'x', 'data', jsonb_build_object('id', 'p1'))));
  assert r.status = 'conflict' and r.rev is not null, 'shared project sent as new is a conflict: ' || r.status;
  assert (select count(*) from public.projects where id = 'p1') = 1, 'no second p1 was made';

  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'user two');
  assert ids = 'n1,s1', 'editor searches the shared project: ' || coalesce(ids, 'none');
  select string_agg(distinct project_id, ',') into ids from public.search_assets(null, 'TIDE');
  assert ids = 'p1,p2', 'search across own and shared projects: ' || coalesce(ids, 'none');

  delete from public.assets where id = 's1';
  get diagnostics n = row_count;
  assert n = 1, 'editor deletes an asset';
  delete from public.projects where id = 'p1';
  get diagnostics n = row_count;
  assert n = 0, 'editor cannot delete the project';
  update public.project_members set role = 'editor' where user_id = '00000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  assert n = 0, 'editor cannot change roles';
  delete from public.project_invites;
  get diagnostics n = row_count;
  assert n = 0, 'editor cannot revoke invites';
end $$;

-- ── editor through the MCP: writes yes, deletes and membership changes no ──
select pg_temp.as_user(2, true);
do $$
declare r record; n int;
begin
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 's2', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 's2', 'title', 'Claude for user two'))));
  assert r.status = 'ok', 'OAuth editor writes';
  delete from public.assets where id = 's2';
  get diagnostics n = row_count;
  assert n = 0, 'OAuth editor cannot delete';
  delete from public.project_members where user_id = '00000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'OAuth client cannot leave';
  begin
    perform public.accept_project_invite((select token from links where role = 'viewer'));
    raise exception 'OAuth client accepted an invite';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── viewer: reads, never writes ──
select pg_temp.as_user(3);
do $$
declare r record; n int;
begin
  assert exists (select 1 from public.assets where id = 'n1'), 'viewer reads';
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes',
    'rev', (select rev from public.assets where id = 'n1'), 'data', jsonb_build_object('id', 'n1', 'title', 'viewer edit'))));
  assert r.status = 'forbidden', 'viewer edit is refused, not a conflict: ' || r.status;
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'v1', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 'v1'))));
  assert r.status = 'forbidden', 'viewer insert is refused: ' || r.status;
  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p1', 'name', 'v',
    'rev', (select rev from public.projects where id = 'p1'), 'data', jsonb_build_object('id', 'p1'))));
  assert r.status = 'forbidden', 'viewer rename is refused: ' || r.status;
  delete from public.assets where id = 'n1';
  get diagnostics n = row_count;
  assert n = 0, 'viewer cannot delete';
  assert (select data->>'title' from public.assets where id = 'n1') = 'Edited by user two', 'nothing changed';
end $$;

-- ── owner changes a role and revokes links; members leave or are removed ──
select pg_temp.as_user(1);
do $$
declare n int;
begin
  update public.project_members set role = 'editor' where user_id = '00000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  assert n = 1, 'owner changes a role';
  delete from public.project_invites where role = 'viewer';
  get diagnostics n = row_count;
  assert n = 1, 'owner revokes a link';
  assert (select data->>'title' from public.assets where id = 's2') = 'Claude for user two', 'owner sees the editor''s rows';
end $$;

select pg_temp.as_user(3);
do $$
begin
  perform public.accept_project_invite((select token from links where role = 'viewer'));
  raise exception 'revoked link was accepted';
exception when no_data_found then null;
end $$;
do $$
declare n int;
begin
  delete from public.project_members where user_id = '00000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  assert n = 1, 'member leaves';
  assert not exists (select 1 from public.projects where id = 'p1'), 'gone after leaving';
  assert not exists (select 1 from public.list_project_members('00000000-0000-0000-0000-000000000001', 'p1')), 'no member list after leaving';
end $$;

-- ── expired links do nothing ──
reset role;
update public.project_invites set expires_at = now() - interval '1 minute';
set role authenticated;
select pg_temp.as_user(3);
do $$
begin
  assert not exists (select 1 from public.preview_project_invite((select token from links where role = 'editor'))), 'expired preview';
  perform public.accept_project_invite((select token from links where role = 'editor'));
  raise exception 'expired link was accepted';
exception when no_data_found then null;
end $$;

-- ── a member deleting their account keeps the owner's rows; the owner deleting theirs ends the share ──
select pg_temp.as_user(2);
select public.delete_own_account();
reset role;
do $$
begin
  assert exists (select 1 from public.assets where id = 's2'), 'rows a member wrote stay with the owner';
  assert not exists (select 1 from public.project_members where user_id = '00000000-0000-0000-0000-000000000002'), 'membership gone';
  assert not exists (select 1 from public.projects where user_id = '00000000-0000-0000-0000-000000000002'), 'member''s own projects gone';
end $$;
insert into public.project_members (owner_id, project_id, user_id, role)
values ('00000000-0000-0000-0000-000000000001', 'p1', '00000000-0000-0000-0000-000000000003', 'viewer');
set role authenticated;
select pg_temp.as_user(1);
select public.delete_own_account();
reset role;
do $$
begin
  assert not exists (select 1 from public.project_members), 'owner deletion removes the members';
  assert not exists (select 1 from public.project_invites), 'and the invites';
  assert not exists (select 1 from public.assets where project_id = 'p1'), 'and the shared rows';
end $$;

-- ── signed out ──
set role anon;
do $$
begin
  perform public.preview_project_invite('x');
  raise exception 'anon previewed an invite';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'all sharing checks passed' as result;
