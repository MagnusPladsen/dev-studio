-- Checks for the MCP step 2 migrations: duplicate repair, search under RLS, rev + compare-and-swap,
-- and the no-delete policies for OAuth clients. Every check raises (and run.sh stops) on failure.
\set u1 '''00000000-0000-0000-0000-000000000001'''
\set u2 '''00000000-0000-0000-0000-000000000002'''

-- ── duplicate repair (as the migration owner) ──
do $$
declare keys text;
begin
  select string_agg(id || '=' || (data->>'key'), ',' order by id) into keys from public.assets where collection = 'issues';
  assert keys = 'i1=TIDE-1,i2=TIDE-8,i3=TIDE-9,i4=TIDE-7,i5=TIDE-1', 'issue keys after repair: ' || keys;
  select string_agg(id || '=' || (data->>'number'), ',' order by id) into keys from public.assets where collection = 'decisions';
  assert keys = 'd1=1,d2=3,d3=2', 'decision numbers after repair: ' || keys;
  assert (select data->>'updatedAt' from public.assets where id = 'i2') is not null, 'repair stamps updatedAt';
  assert (select rev from public.assets where id = 'i2') = 2, 'repair bumps rev';
  assert (select rev from public.assets where id = 'i1') = 1, 'untouched rows keep their rev';
end $$;

do $$
begin
  insert into public.assets (user_id, id, project_id, collection, data)
  values ('00000000-0000-0000-0000-000000000001', 'i9', 'p1', 'issues', '{"id":"i9","key":"TIDE-7"}');
  raise exception 'duplicate issue key was accepted';
exception when unique_violation then null;
end $$;

-- ── user 1, signed in through the browser ──
set role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false); end $$;

do $$
declare r record;
begin
  -- new rows
  for r in select * from public.save_assets(jsonb_build_array(
      jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes', 'rev', null,
        'data', jsonb_build_object('id', 'n1', 'title', 'Deploy checklist', 'content', 'Running the migrations before the release', 'tags', jsonb_build_array('ops'))),
      jsonb_build_object('id', 'n2', 'project_id', 'p1', 'collection', 'notes',
        'data', jsonb_build_object('id', 'n2', 'title', 'Ukeplan', 'content', 'Oppgaver for uka: rydde backloggen og skrive dokumentasjon')),
      jsonb_build_object('id', 'c1', 'project_id', 'p1', 'collection', 'diagrams',
        'data', jsonb_build_object('id', 'c1', 'name', 'Data model',
          'nodes', jsonb_build_array(
            jsonb_build_object('id', 'e1', 'type', 'table', 'label', 'accounts',
              'data', jsonb_build_object('columns', jsonb_build_array(jsonb_build_object('id', 'col1', 'name', 'email_address', 'type', 'text')))),
            jsonb_build_object('id', 'e2', 'type', 'checklist', 'label', 'Launch',
              'data', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'x', 'text', 'Invite testers', 'done', false))))),
          'edges', jsonb_build_array(jsonb_build_object('id', 'l1', 'from', 'e1', 'to', 'e2', 'label', 'feeds')))),
      jsonb_build_object('id', 'w1', 'project_id', 'p1', 'collection', 'stories',
        'data', jsonb_build_object('id', 'w1', 'title', 'Sync engine', 'type', 'system', 'content', 'Explains how Realtime echo suppression works')),
      jsonb_build_object('id', 'odd', 'project_id', 'p1', 'collection', 'issues',
        'data', jsonb_build_object('id', 'odd', 'key', 'TIDE-20', 'title', 'Odd shapes', 'labels', 'not-an-array', 'tags', jsonb_build_object('x', 1))),
      jsonb_build_object('id', 'k1', 'project_id', 'p1', 'collection', 'links',
        'data', jsonb_build_object('id', 'k1', 'from', jsonb_build_object('id', 'n1'), 'to', jsonb_build_object('id', 'c1')))
  )) loop
    assert r.status = 'ok' and r.rev = 1 and r.updated_at is not null, format('insert %s: %s rev %s', r.id, r.status, r.rev);
  end loop;
end $$;

-- search
do $$
declare ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'run');
  assert ids = 'n1', 'English stemming (run → Running): ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'oppgaver');
  assert ids = 'n2', 'Norwegian exact word: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'oppgave');
  assert ids = 'n2', 'Norwegian partial word via trigrams: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'dokumentasjonen');
  assert ids = 'n2', 'Norwegian inflected form via trigrams: ' || coalesce(ids, 'none');
  select id into ids from public.search_assets('p1', 'TIDE-8') limit 1;
  assert ids = 'i2', 'issue key ranks first: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'email_address');
  assert ids = 'c1', 'canvas table column: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'testers');
  assert ids = 'c1', 'canvas checklist item: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'echo suppression');
  assert ids = 'w1', 'wiki page: ' || coalesce(ids, 'none');
  select id into ids from public.search_assets('p1', 'ADR-003') limit 1;
  assert ids = 'd2', 'ADR number ranks first: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets(null, 'ops');
  assert ids = 'n1', 'tags, all projects: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', 'Postgres', array['decisions']);
  assert ids = 'd1', 'collection filter: ' || coalesce(ids, 'none');
  select string_agg(id, ',' order by id) into ids from public.search_assets('p1', '   ');
  assert ids is null, 'blank query finds nothing';
  assert not exists (select 1 from public.asset_search where id = 'k1'), 'links are not indexed';
  assert (select snippet from public.search_assets('p1', 'migrations') limit 1) like '%<b>migrations</b>%', 'snippet highlights the hit';
  assert (select title from public.search_assets('p1', 'Postgres') limit 1) = 'ADR-001 Use Postgres', 'decision title';
end $$;

-- compare-and-swap
do $$
declare r record;
begin
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes', 'rev', 1,
    'data', jsonb_build_object('id', 'n1', 'title', 'Deploy checklist v2', 'content', 'Rolling back is documented'))));
  assert r.status = 'ok' and r.rev = 2, format('CAS update: %s rev %s', r.status, r.rev);

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes', 'rev', 1,
    'data', jsonb_build_object('id', 'n1', 'title', 'stale write'))));
  assert r.status = 'conflict' and r.rev = 2, format('stale rev is refused: %s rev %s', r.status, r.rev);
  assert (select data->>'title' from public.assets where id = 'n1') = 'Deploy checklist v2', 'stale write changed nothing';

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 'n1', 'title', 'blind insert'))));
  assert r.status = 'conflict' and r.rev = 2, 'insert over an existing row is a conflict';

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'gone', 'project_id', 'p1', 'collection', 'notes', 'rev', 4,
    'data', jsonb_build_object('id', 'gone'))));
  assert r.status = 'missing' and r.rev is null, 'update of a deleted row: ' || r.status;

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'i10', 'project_id', 'p1', 'collection', 'issues',
    'data', jsonb_build_object('id', 'i10', 'key', 'TIDE-9'))));
  assert r.status = 'duplicate', 'taken issue key: ' || r.status;

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'x1', 'project_id', 'no-such-project', 'collection', 'notes',
    'data', jsonb_build_object('id', 'x1'))));
  assert r.status = 'orphan', 'asset in a missing project: ' || r.status;

  -- one bad row does not stop the others
  assert (select string_agg(status, ',') from public.save_assets(jsonb_build_array(
    jsonb_build_object('id', 'i11', 'project_id', 'p1', 'collection', 'issues', 'data', jsonb_build_object('id', 'i11', 'key', 'TIDE-9')),
    jsonb_build_object('id', 'i12', 'project_id', 'p1', 'collection', 'issues', 'data', jsonb_build_object('id', 'i12', 'key', 'TIDE-10'))))) = 'duplicate,ok',
    'rows are saved independently';

  -- older clients upsert directly; rev still moves, and clients cannot set it
  update public.assets set data = data || '{"title":"old client"}', rev = 100 where id = 'n1';
  assert (select rev from public.assets where id = 'n1') = 3, 'rev is server-controlled';
  assert (select title from public.asset_search where id = 'n1') = 'old client', 'search follows direct updates';

  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p1', 'name', 'Tidepool 2', 'rev', 1,
    'data', jsonb_build_object('id', 'p1', 'name', 'Tidepool 2'))));
  assert r.status = 'ok' and r.rev = 2, format('project CAS: %s rev %s', r.status, r.rev);
  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p1', 'name', 'x', 'rev', 1, 'data', '{}'::jsonb)));
  assert r.status = 'conflict' and r.rev = 2, 'stale project write';
  select * into r from public.save_projects(jsonb_build_array(jsonb_build_object('id', 'p3', 'name', 'New', 'data', jsonb_build_object('id', 'p3'))));
  assert r.status = 'ok' and r.rev = 1, 'new project';
end $$;

-- ── user 2 cannot see or touch user 1's rows ──
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', false); end $$;
do $$
declare r record; ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.search_assets(null, 'TIDE');
  assert ids = 'i5', 'user 2 searches only their own rows: ' || coalesce(ids, 'none');
  assert (select count(*) from public.search_assets('p1', 'migrations')) = 0, 'user 2 finds nothing in user 1''s project';
  assert (select count(*) from public.asset_search) = 1, 'user 2 reads only their own search rows';

  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes', 'rev', 3,
    'data', jsonb_build_object('id', 'n1', 'title', 'hijack'))));
  assert r.status = 'missing', 'user 2 cannot update user 1''s row: ' || r.status;
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n1', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 'n1', 'title', 'hijack'))));
  assert r.status = 'orphan', 'user 2 cannot write into user 1''s project: ' || r.status;

  begin
    insert into public.asset_search (user_id, id, project_id, collection, title, body, tsv)
    values ('00000000-0000-0000-0000-000000000002', 'i5', 'p2', 'issues', 'x', 'x', ''::tsvector);
    raise exception 'user wrote asset_search directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── user 1 through an OAuth client (the MCP server): writes yes, deletes no ──
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d"}', false); end $$;
do $$
declare r record; n int;
begin
  select * into r from public.save_assets(jsonb_build_array(jsonb_build_object('id', 'n3', 'project_id', 'p1', 'collection', 'notes',
    'data', jsonb_build_object('id', 'n3', 'title', 'Written by Claude'))));
  assert r.status = 'ok', 'OAuth client can insert';
  update public.assets set data = data || '{"title":"Edited by Claude"}' where id = 'n3';
  get diagnostics n = row_count;
  assert n = 1, 'OAuth client can update';
  assert (select count(*) from public.search_assets('p1', 'Claude')) = 1, 'OAuth client can search';

  delete from public.assets where id = 'n3';
  get diagnostics n = row_count;
  assert n = 0, 'OAuth client cannot delete assets';
  delete from public.projects where id = 'p1';
  get diagnostics n = row_count;
  assert n = 0, 'OAuth client cannot delete projects';
  assert exists (select 1 from public.assets where id = 'n3'), 'asset still there';
end $$;

-- ── back in the browser: deletes work as before ──
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false); end $$;
do $$
declare n int;
begin
  delete from public.assets where id = 'n3';
  get diagnostics n = row_count;
  assert n = 1, 'browser session can delete assets';
  assert not exists (select 1 from public.asset_search where id = 'n3'), 'deleting an asset drops its search row';
  delete from public.projects where id = 'p3';
  get diagnostics n = row_count;
  assert n = 1, 'browser session can delete projects';
end $$;

-- ── signed out ──
reset role;
set role anon;
do $$
begin
  perform public.search_assets(null, 'TIDE');
  raise exception 'anon could search';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.save_assets('[]'::jsonb);
  raise exception 'anon could save';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'all database checks passed' as result;
