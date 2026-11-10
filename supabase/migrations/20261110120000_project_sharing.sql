-- Shared projects: an owner invites other signed-in users as editors or viewers.
--
-- Every row of a project stays filed under its owner (projects.user_id / assets.user_id), so keys,
-- unique issue keys, search rows and account deletion keep working per owner. What changes is who
-- may read and write those rows:
--   owner   everything, as before (the owner is never a row in project_members)
--   editor  reads the project, edits it and its assets, deletes assets; not the project itself
--   viewer  reads only
-- Members join through an invite link (a random token, 7 days, many uses, revocable by the owner).
-- OAuth clients (the MCP server) get the caller's role for reading and writing, keep the existing
-- no-delete rule, and cannot invite, accept, change roles, remove members or leave.

create table if not exists public.project_members (
  owner_id   uuid        not null,
  project_id text        not null,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (owner_id, project_id, user_id),
  foreign key (owner_id, project_id) references public.projects (user_id, id) on delete cascade,
  check (owner_id <> user_id)
);
create index if not exists project_members_user_idx on public.project_members (user_id);

create table if not exists public.project_invites (
  token      text        primary key
             default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  owner_id   uuid        not null,
  project_id text        not null,
  role       text        not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  foreign key (owner_id, project_id) references public.projects (user_id, id) on delete cascade
);
create index if not exists project_invites_project_idx on public.project_invites (owner_id, project_id);

-- The caller's role in a project: 'owner', 'editor', 'viewer' or null. Security definer so policies
-- on projects/assets can call it without recursing into project_members' own policies.
create or replace function public.project_role(p_owner uuid, p_project_id text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner = (select auth.uid()) then 'owner'
    else (select m.role from public.project_members m
          where m.owner_id = p_owner and m.project_id = p_project_id and m.user_id = (select auth.uid()))
  end
$$;
revoke all on function public.project_role(uuid, text) from public, anon;
grant execute on function public.project_role(uuid, text) to authenticated;

create or replace function public.is_oauth_client() returns boolean
language sql stable set search_path = '' as $$
  select (select auth.jwt() ->> 'client_id') is not null
$$;

-- ── projects ──
drop policy if exists "own projects" on public.projects;
drop policy if exists "members read projects" on public.projects;
drop policy if exists "owners create projects" on public.projects;
drop policy if exists "owners and editors update projects" on public.projects;
drop policy if exists "owners delete projects" on public.projects;

create policy "members read projects" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, id) is not null);
create policy "owners create projects" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owners and editors update projects" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, id) = 'editor')
  with check (user_id = (select auth.uid()) or public.project_role(user_id, id) = 'editor');
create policy "owners delete projects" on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── assets ──
drop policy if exists "own assets" on public.assets;
drop policy if exists "members read assets" on public.assets;
drop policy if exists "owners and editors write assets" on public.assets;
drop policy if exists "owners and editors update assets" on public.assets;
drop policy if exists "owners and editors delete assets" on public.assets;

create policy "members read assets" on public.assets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, project_id) is not null);
create policy "owners and editors write assets" on public.assets
  for insert to authenticated
  with check (user_id = (select auth.uid()) or public.project_role(user_id, project_id) = 'editor');
create policy "owners and editors update assets" on public.assets
  for update to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, project_id) = 'editor')
  with check (user_id = (select auth.uid()) or public.project_role(user_id, project_id) = 'editor');
create policy "owners and editors delete assets" on public.assets
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, project_id) = 'editor');

-- ── search follows asset visibility ──
drop policy if exists "own search rows" on public.asset_search;
drop policy if exists "members read search rows" on public.asset_search;
create policy "members read search rows" on public.asset_search
  for select to authenticated
  using (user_id = (select auth.uid()) or public.project_role(user_id, project_id) is not null);

create or replace function public.search_assets(
  p_project_id  text,
  p_query       text,
  p_collections text[] default null,
  p_limit       int    default 20
) returns table (id text, project_id text, collection text, title text, snippet text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select trim(p_query) as text,
           websearch_to_tsquery('pg_catalog.english'::regconfig, trim(p_query)) as english,
           websearch_to_tsquery('pg_catalog.simple'::regconfig, trim(p_query)) as simple
  ), owners as (
    select (select auth.uid()) as owner_id, null::text as project_id
    union all
    select m.owner_id, m.project_id from public.project_members m where m.user_id = (select auth.uid())
  ), hits as (
    select s.*, q.text as query, q.english, q.simple,
           s.tsv @@ q.english as english_hit,
           s.tsv @@ (q.english || q.simple) as word_hit
    from public.asset_search s
    join owners o on o.owner_id = s.user_id and (o.project_id is null or o.project_id = s.project_id)
    cross join q
    where q.text <> ''
      and (p_project_id is null or s.project_id = p_project_id)
      and (p_collections is null or s.collection = any (p_collections))
      and (s.tsv @@ (q.english || q.simple) or q.text operator(extensions.<%) s.body)
  )
  select h.id, h.project_id, h.collection, h.title,
         case
           when h.english_hit then ts_headline('pg_catalog.english'::regconfig, h.body, h.english,
                                               'MaxWords=24, MinWords=8, MaxFragments=1')
           when h.word_hit then ts_headline('pg_catalog.simple'::regconfig, h.body, h.simple,
                                            'MaxWords=24, MinWords=8, MaxFragments=1')
           else left(substr(h.body, greatest(1, strpos(lower(h.body), lower(h.query)) - 60)), 200)
         end as snippet,
         greatest(ts_rank(h.tsv, h.english || h.simple, 1),
                  extensions.word_similarity(h.query, h.body) * 0.5)::real as rank
  from hits h
  order by rank desc, h.title
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- ── members and invites: read through RLS, changed through the functions below ──
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
revoke all on public.project_members from public, anon, authenticated;
revoke all on public.project_invites from public, anon, authenticated;
grant select, update (role), delete on public.project_members to authenticated;
grant select, delete on public.project_invites to authenticated;

drop policy if exists "members see their memberships" on public.project_members;
create policy "members see their memberships" on public.project_members
  for select to authenticated
  using (user_id = (select auth.uid()) or owner_id = (select auth.uid()));
drop policy if exists "owners change roles" on public.project_members;
create policy "owners change roles" on public.project_members
  for update to authenticated
  using (owner_id = (select auth.uid()) and not public.is_oauth_client())
  with check (owner_id = (select auth.uid()));
drop policy if exists "owners remove members, members leave" on public.project_members;
create policy "owners remove members, members leave" on public.project_members
  for delete to authenticated
  using ((owner_id = (select auth.uid()) or user_id = (select auth.uid())) and not public.is_oauth_client());

drop policy if exists "owners see their invites" on public.project_invites;
create policy "owners see their invites" on public.project_invites
  for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "owners revoke invites" on public.project_invites;
create policy "owners revoke invites" on public.project_invites
  for delete to authenticated
  using (owner_id = (select auth.uid()) and not public.is_oauth_client());

create or replace function public.require_app_session() returns uuid
language plpgsql stable set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Not signed in';
  end if;
  if public.is_oauth_client() then
    raise exception using errcode = '42501', message = 'Sharing is managed in the app';
  end if;
  return caller;
end $$;

-- An invite link for one of the caller's own projects.
create or replace function public.create_project_invite(p_project_id text, p_role text)
returns table (token text, role text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare caller uuid := public.require_app_session();
begin
  if not exists (select 1 from public.projects p where p.user_id = caller and p.id = p_project_id) then
    raise exception using errcode = '42501', message = 'Only the owner can invite people';
  end if;
  return query
    insert into public.project_invites as i (owner_id, project_id, role)
    values (caller, p_project_id, p_role)
    returning i.token, i.role, i.expires_at;
end $$;

-- What an invite link leads to, for the accept page. Nothing for unknown or expired links.
create or replace function public.preview_project_invite(p_token text)
returns table (owner_id uuid, project_id text, project_name text, owner_email text, role text, my_role text)
language sql stable security definer set search_path = '' as $$
  select i.owner_id, i.project_id, p.name, u.email::text, i.role,
         case when i.owner_id = (select auth.uid()) then 'owner'
              else (select m.role from public.project_members m
                    where m.owner_id = i.owner_id and m.project_id = i.project_id and m.user_id = (select auth.uid()))
         end
  from public.project_invites i
  join public.projects p on p.user_id = i.owner_id and p.id = i.project_id
  join auth.users u on u.id = i.owner_id
  where i.token = p_token and i.expires_at > now() and (select auth.uid()) is not null
$$;

-- Join a project through an invite link. Joining again never lowers a role.
create or replace function public.accept_project_invite(p_token text)
returns table (owner_id uuid, project_id text, role text)
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := public.require_app_session();
  invite public.project_invites;
begin
  select * into invite from public.project_invites i where i.token = p_token and i.expires_at > now();
  if not found then
    raise exception using errcode = 'P0002', message = 'This invite link has expired or was revoked';
  end if;
  if invite.owner_id = caller then
    return query select invite.owner_id, invite.project_id, 'owner'::text;
    return;
  end if;
  return query
    insert into public.project_members as m (owner_id, project_id, user_id, role)
    values (invite.owner_id, invite.project_id, caller, invite.role)
    on conflict on constraint project_members_pkey do update
      set role = case when m.role = 'editor' then 'editor' else excluded.role end
    returning m.owner_id, m.project_id, m.role;
end $$;

-- Everyone in a project with their email, owner first. Only for the project's owner and members.
create or replace function public.list_project_members(p_owner uuid, p_project_id text)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, 'owner'::text
  from auth.users u
  where u.id = p_owner and public.project_role(p_owner, p_project_id) is not null
    and exists (select 1 from public.projects p where p.user_id = p_owner and p.id = p_project_id)
  union all
  select m.user_id, u.email::text, m.role
  from public.project_members m join auth.users u on u.id = m.user_id
  where m.owner_id = p_owner and m.project_id = p_project_id and public.project_role(p_owner, p_project_id) is not null
$$;

-- The projects shared with the caller: who owns each and the caller's role there.
create or replace function public.my_shared_projects()
returns table (owner_id uuid, project_id text, role text, owner_email text)
language sql stable security definer set search_path = '' as $$
  select m.owner_id, m.project_id, m.role, u.email::text
  from public.project_members m join auth.users u on u.id = m.owner_id
  where m.user_id = (select auth.uid())
$$;

revoke all on function public.is_oauth_client() from public, anon;
revoke all on function public.require_app_session() from public, anon;
revoke all on function public.create_project_invite(text, text) from public, anon;
revoke all on function public.preview_project_invite(text) from public, anon;
revoke all on function public.accept_project_invite(text) from public, anon;
revoke all on function public.list_project_members(uuid, text) from public, anon;
revoke all on function public.my_shared_projects() from public, anon;
grant execute on function public.is_oauth_client() to authenticated;
grant execute on function public.require_app_session() to authenticated;
grant execute on function public.create_project_invite(text, text) to authenticated;
grant execute on function public.preview_project_invite(text) to authenticated;
grant execute on function public.accept_project_invite(text) to authenticated;
grant execute on function public.list_project_members(uuid, text) to authenticated;
grant execute on function public.my_shared_projects() to authenticated;

-- ── saves write a shared project's rows under its owner ──
-- The row a client means by an id: the caller's own if there is one, else one shared with them.
create or replace function public.save_projects(p_rows jsonb)
returns table (id text, rev bigint, updated_at timestamptz, status text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user     uuid := auth.uid();
  v_owner    uuid;
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
    select p.user_id into v_owner from public.projects p where p.id = v_id
      order by p.user_id = v_user desc limit 1;
    v_owner := coalesce(v_owner, v_user);
    if v_expected is null and v_owner = v_user then
      insert into public.projects as p (user_id, id, name, data)
      values (v_user, v_id, coalesce(v_row->>'name', ''), v_row->'data')
      on conflict on constraint projects_pkey do nothing
      returning p.id, p.rev, p.updated_at, 'ok' into id, rev, updated_at, status;
    elsif v_expected is not null then
      update public.projects as p set name = coalesce(v_row->>'name', ''), data = v_row->'data'
      where p.user_id = v_owner and p.id = v_id and p.rev = v_expected
      returning p.id, p.rev, p.updated_at, 'ok' into id, rev, updated_at, status;
    else
      perform from public.projects where false; -- a shared project sent as new: answer with its rev below
    end if;
    if not found then
      select p.id, p.rev, p.updated_at, 'conflict' into id, rev, updated_at, status
      from public.projects p where p.user_id = v_owner and p.id = v_id;
      if not found then
        id := v_id; rev := null; updated_at := null; status := 'missing';
      elsif rev = v_expected then
        status := 'forbidden';
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
  v_owner    uuid;
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
    select p.user_id into v_owner from public.projects p where p.id = v_row->>'project_id'
      order by p.user_id = v_user desc limit 1;
    v_owner := coalesce(v_owner, v_user);
    begin
      if v_expected is null then
        insert into public.assets as a (user_id, id, project_id, collection, data)
        values (v_owner, v_id, v_row->>'project_id', v_row->>'collection', v_row->'data')
        on conflict on constraint assets_pkey do nothing
        returning a.id, a.rev, a.updated_at, 'ok' into id, rev, updated_at, status;
      else
        update public.assets as a
        set project_id = v_row->>'project_id', collection = v_row->>'collection', data = v_row->'data'
        where a.user_id = v_owner and a.id = v_id and a.rev = v_expected
        returning a.id, a.rev, a.updated_at, 'ok' into id, rev, updated_at, status;
      end if;
      if not found then
        select a.id, a.rev, a.updated_at, 'conflict' into id, rev, updated_at, status
        from public.assets a where a.user_id = v_owner and a.id = v_id;
        if not found then
          id := v_id; rev := null; updated_at := null; status := 'missing';
        elsif rev = v_expected then
          status := 'forbidden';
        end if;
      end if;
    exception
      when unique_violation then
        id := v_id; rev := null; updated_at := null; status := 'duplicate';
      when foreign_key_violation then
        id := v_id; rev := null; updated_at := null; status := 'orphan';
      when insufficient_privilege then
        id := v_id; rev := null; updated_at := null; status := 'forbidden';
    end;
    return next;
  end loop;
end $$;

-- ── account deletion also ends the caller's memberships (their own projects take their members along) ──
create or replace function public.delete_own_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  if auth.jwt() ->> 'client_id' is not null then
    raise exception using errcode = '42501', message = 'Accounts can only be deleted from the app';
  end if;
  delete from public.project_members where user_id = caller;
  delete from public.assets where user_id = caller;
  delete from public.projects where user_id = caller;
  delete from auth.users where id = caller;
end;
$$;
