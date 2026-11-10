-- Live membership changes: when someone joins, leaves, is removed or gets a new role, both the
-- member and the owner get a row here, and their open tabs re-read what is shared with them.
--
-- project_members itself is not streamed: Realtime cannot check RLS on delete events, so removing a
-- member would send that row's key (who is in which project) to every subscriber. These rows carry
-- only whose tab should refresh; Realtime checks the select policy before sending an insert, and
-- clients listen to inserts only.
create table public.sharing_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index sharing_events_user_idx on public.sharing_events (user_id, created_at);

alter table public.sharing_events enable row level security;
grant select on public.sharing_events to authenticated;
create policy "read own sharing events" on public.sharing_events
  for select using (user_id = auth.uid());

create or replace function public.note_sharing_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.project_members := coalesce(new, old);
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then return null; end if;
  -- the owner's account may be going away (delete cascades); only notify users that still exist
  insert into public.sharing_events (user_id)
    select u.id from auth.users u where u.id in (v_row.owner_id, v_row.user_id);
  delete from public.sharing_events where created_at < now() - interval '1 day';
  return null;
end $$;

create trigger project_members_note_change after insert or update or delete on public.project_members
  for each row execute function public.note_sharing_change();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sharing_events'
  ) then
    alter publication supabase_realtime add table public.sharing_events;
  end if;
end $$;
