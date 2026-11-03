-- Issue keys (TIDE-12) and ADR numbers are unique per project. Two writers (a browser tab and the MCP
-- server) take the next number without touching the same row, so only the database can guarantee it.
--
-- Repair first, because this applies automatically on merge: within a project, the oldest issue
-- (by createdAt, then id) keeps a duplicated key and every later one gets the next free number with
-- the same prefix (TIDE-4, TIDE-4 → TIDE-4, TIDE-31 when TIDE-30 is the highest). Decisions work the
-- same way with their number. Each change is logged as a NOTICE and bumps the row's updatedAt, so open
-- tabs pick it up. Text elsewhere that mentions the old key (wiki pages, notes) is not rewritten.
do $$
declare
  dup       record;
  v_prefix  text;
  v_next    numeric;
  v_new_key text;
begin
  for dup in
    select user_id, id, project_id, data->>'key' as key
    from (
      select a.user_id, a.id, a.project_id, a.data,
             row_number() over (partition by a.user_id, a.project_id, a.data->>'key'
                                order by a.data->>'createdAt' nulls last, a.id) as position
      from public.assets a
      where a.collection = 'issues' and a.data->>'key' is not null
    ) ranked
    where position > 1
    order by user_id, project_id, data->>'createdAt' nulls last, id
  loop
    v_prefix := coalesce(substring(dup.key from '^(.*)-\d+$'), dup.key);
    select coalesce(max(substr(a.data->>'key', length(v_prefix) + 2)::numeric), 0) + 1 into v_next
    from public.assets a
    where a.user_id = dup.user_id and a.project_id = dup.project_id and a.collection = 'issues'
      and left(a.data->>'key', length(v_prefix) + 1) = v_prefix || '-'
      and substr(a.data->>'key', length(v_prefix) + 2) ~ '^\d+$';
    v_new_key := v_prefix || '-' || v_next;
    update public.assets a
    set data = a.data || jsonb_build_object('key', v_new_key, 'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    where a.user_id = dup.user_id and a.id = dup.id;
    raise notice 'Renumbered issue % in project % from % to %', dup.id, dup.project_id, dup.key, v_new_key;
  end loop;

  for dup in
    select user_id, id, project_id, data->>'number' as number
    from (
      select a.user_id, a.id, a.project_id, a.data,
             row_number() over (partition by a.user_id, a.project_id, a.data->>'number'
                                order by a.data->>'createdAt' nulls last, a.id) as position
      from public.assets a
      where a.collection = 'decisions' and a.data->>'number' is not null
    ) ranked
    where position > 1
    order by user_id, project_id, data->>'createdAt' nulls last, id
  loop
    select coalesce(max((a.data->>'number')::numeric), 0) + 1 into v_next
    from public.assets a
    where a.user_id = dup.user_id and a.project_id = dup.project_id and a.collection = 'decisions'
      and a.data->>'number' ~ '^\d+$';
    update public.assets a
    set data = a.data || jsonb_build_object('number', v_next, 'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    where a.user_id = dup.user_id and a.id = dup.id;
    raise notice 'Renumbered decision % in project % from % to %', dup.id, dup.project_id, dup.number, v_next;
  end loop;
end $$;

-- If anything slipped through the repair, these fail and the migration stops with the duplicate named.
create unique index if not exists assets_issue_key_uniq
  on public.assets (user_id, project_id, (data->>'key'))
  where collection = 'issues';

create unique index if not exists assets_decision_number_uniq
  on public.assets (user_id, project_id, (data->>'number'))
  where collection = 'decisions';
