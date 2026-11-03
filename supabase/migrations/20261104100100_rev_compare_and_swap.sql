-- Revisions and compare-and-swap writes, so a second writer (another tab, the MCP server) can never
-- silently overwrite a newer version of a row.
--
-- Every insert starts a row at rev 1 and every update adds one; clients cannot set rev themselves.
-- Rows written before this migration keep rev 0 until their next write.
--
-- save_projects / save_assets write many rows in one call. Each row carries the rev the client last
-- saw (null for a row it believes is new) and is written only if the server still holds that rev.
-- Per row they return:
--   ok        written; rev and updated_at are the new server values
--   conflict  the server holds another rev (returned) or the row already exists: re-read, merge, retry
--   missing   the row was deleted since the client read it
--   duplicate (assets) another issue/decision in the project already has this key/number
--   orphan    (assets) the project no longer exists
-- Older clients that still upsert through PostgREST keep working (last write wins), and their writes
-- bump rev, so CAS clients notice them.
alter table public.projects add column if not exists rev bigint not null default 0;
alter table public.assets   add column if not exists rev bigint not null default 0;

create or replace function public.bump_rev() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
  else
    new.rev := old.rev + 1;
  end if;
  return new;
end $$;

drop trigger if exists projects_bump_rev on public.projects;
create trigger projects_bump_rev before insert or update on public.projects
  for each row execute function public.bump_rev();

drop trigger if exists assets_bump_rev on public.assets;
create trigger assets_bump_rev before insert or update on public.assets
  for each row execute function public.bump_rev();

create or replace function public.save_projects(p_rows jsonb)
returns table (id text, rev bigint, updated_at timestamptz, status text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user     uuid := auth.uid();
  v_row      jsonb;
  v_id       text;
  v_expected bigint;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_id := v_row->>'id';
    v_expected := (v_row->>'rev')::bigint;
    if v_expected is null then
      insert into public.projects as p (user_id, id, name, data)
      values (v_user, v_id, coalesce(v_row->>'name', ''), v_row->'data')
      on conflict on constraint projects_pkey do nothing
      returning p.id, p.rev, p.updated_at, 'ok' into id, rev, updated_at, status;
    else
      update public.projects as p set name = coalesce(v_row->>'name', ''), data = v_row->'data'
      where p.user_id = v_user and p.id = v_id and p.rev = v_expected
      returning p.id, p.rev, p.updated_at, 'ok' into id, rev, updated_at, status;
    end if;
    if not found then
      select p.id, p.rev, p.updated_at, 'conflict' into id, rev, updated_at, status
      from public.projects p where p.user_id = v_user and p.id = v_id;
      if not found then
        id := v_id; rev := null; updated_at := null; status := 'missing';
      end if;
    end if;
    return next;
  end loop;
end $$;

create or replace function public.save_assets(p_rows jsonb)
returns table (id text, rev bigint, updated_at timestamptz, status text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user     uuid := auth.uid();
  v_row      jsonb;
  v_id       text;
  v_expected bigint;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_id := v_row->>'id';
    v_expected := (v_row->>'rev')::bigint;
    begin
      if v_expected is null then
        insert into public.assets as a (user_id, id, project_id, collection, data)
        values (v_user, v_id, v_row->>'project_id', v_row->>'collection', v_row->'data')
        on conflict on constraint assets_pkey do nothing
        returning a.id, a.rev, a.updated_at, 'ok' into id, rev, updated_at, status;
      else
        update public.assets as a
        set project_id = v_row->>'project_id', collection = v_row->>'collection', data = v_row->'data'
        where a.user_id = v_user and a.id = v_id and a.rev = v_expected
        returning a.id, a.rev, a.updated_at, 'ok' into id, rev, updated_at, status;
      end if;
      if not found then
        select a.id, a.rev, a.updated_at, 'conflict' into id, rev, updated_at, status
        from public.assets a where a.user_id = v_user and a.id = v_id;
        if not found then
          id := v_id; rev := null; updated_at := null; status := 'missing';
        end if;
      end if;
    exception
      when unique_violation then
        id := v_id; rev := null; updated_at := null; status := 'duplicate';
      when foreign_key_violation then
        id := v_id; rev := null; updated_at := null; status := 'orphan';
    end;
    return next;
  end loop;
end $$;

revoke all on function public.save_projects(jsonb) from public, anon;
revoke all on function public.save_assets(jsonb)   from public, anon;
grant execute on function public.save_projects(jsonb) to authenticated;
grant execute on function public.save_assets(jsonb)   to authenticated;
