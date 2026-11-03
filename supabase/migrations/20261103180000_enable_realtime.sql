-- Live updates: stream changes to projects and assets to the signed-in owner's open tabs.
--
-- Realtime checks the "own projects" / "own assets" policies before sending an insert or update,
-- so a user only receives their own rows. Delete events cannot be checked against RLS; with
-- replica identity full they can at least be filtered by user_id (part of the primary key), and
-- with RLS on, Realtime sends only the primary key of a deleted row, never its data.
alter table public.projects replica identity full;
alter table public.assets   replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets'
  ) then
    alter publication supabase_realtime add table public.assets;
  end if;
end $$;

-- The server stamps updated_at, so every client (and the MCP server) orders writes on one clock.
-- Clients use it to catch up after a reconnect and to drop events older than their own last write.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before insert or update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists assets_touch_updated_at on public.assets;
create trigger assets_touch_updated_at before insert or update on public.assets
  for each row execute function public.touch_updated_at();

create index if not exists assets_updated_idx on public.assets (user_id, updated_at);
create index if not exists projects_updated_idx on public.projects (user_id, updated_at);
