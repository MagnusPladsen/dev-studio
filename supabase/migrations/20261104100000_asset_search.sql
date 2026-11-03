-- Search inside Postgres for the MCP server (and later the app's search box).
--
-- The searchable text of each asset lives in its own table, kept in step by a trigger, rather than in
-- generated columns on `assets`: assets rows are streamed by Realtime with every column, and a second
-- copy of every note and wiki page would double those messages.
--
-- Matching: English full-text (stemming, so "running" finds "run") or'ed with the `simple` config (exact
-- words, so Norwegian and other languages match as written), plus trigram word similarity for partial
-- words, typos and keys like TIDE-12.
create extension if not exists pg_trgm with schema extensions;

-- jsonb_array_elements fails on anything but an array; bodies are user data, so never assume the shape.
create or replace function public.json_array_or_empty(value jsonb) returns jsonb
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end
$$;

create or replace function public.json_texts(value jsonb, separator text default ' ') returns text
language sql immutable parallel safe set search_path = '' as $$
  select string_agg(item #>> '{}', separator)
  from jsonb_array_elements(public.json_array_or_empty(value)) item
  where jsonb_typeof(item) in ('string', 'number')
$$;

-- What a hit is called in results: the issue key or ADR number in front of the title.
create or replace function public.asset_search_title(collection text, data jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(case collection
    when 'issues'    then concat_ws(' ', data->>'key', data->>'title')
    when 'decisions' then concat_ws(' ',
                            case when data->>'number' ~ '^\d+$' then 'ADR-' || lpad(data->>'number', 3, '0') end,
                            data->>'title')
    else coalesce(data->>'title', data->>'name')
  end, '')
$$;

-- The searchable text of one asset body, per collection. Art and audio contribute their names only.
create or replace function public.asset_search_text(collection text, data jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select left(concat_ws(' ',
    public.asset_search_title(collection, data),
    case collection
      when 'issues'    then concat_ws(' ', data->>'description', public.json_texts(data->'labels'))
      when 'notes'     then concat_ws(' ', data->>'folder', data->>'content')
      when 'stories'   then concat_ws(' ', data->>'type', data->>'content')
      when 'decisions' then concat_ws(' ', data->>'context', data->>'options', data->>'decision', data->>'consequences')
      when 'diagrams'  then concat_ws(' ',
        (select string_agg(concat_ws(' ',
                  node->>'label',
                  (select string_agg(concat_ws(' ', col->>'name', col->>'type'), ' ')
                     from jsonb_array_elements(public.json_array_or_empty(node->'data'->'columns')) col),
                  (select string_agg(item->>'text', ' ')
                     from jsonb_array_elements(public.json_array_or_empty(node->'data'->'items')) item),
                  node->'data'->>'url',
                  node->'data'->'preview'->>'title',
                  node->'data'->'preview'->>'description'), ' ')
           from jsonb_array_elements(public.json_array_or_empty(data->'nodes')) node),
        (select string_agg(edge->>'label', ' ')
           from jsonb_array_elements(public.json_array_or_empty(data->'edges')) edge))
      when 'dialogues' then
        (select string_agg(concat_ws(' ', node->>'speaker', node->>'text', node->>'condition',
                  (select string_agg(choice->>'text', ' ')
                     from jsonb_array_elements(public.json_array_or_empty(node->'choices')) choice)), ' ')
           from jsonb_array_elements(public.json_array_or_empty(data->'nodes')) node)
    end,
    public.json_texts(data->'tags')), 200000)
$$;

create table if not exists public.asset_search (
  user_id    uuid     not null,
  id         text     not null,
  project_id text     not null,
  collection text     not null,
  title      text     not null,
  body       text     not null,
  tsv        tsvector not null,
  primary key (user_id, id),
  foreign key (user_id, id) references public.assets (user_id, id) on delete cascade
);

create index if not exists asset_search_project_idx on public.asset_search (user_id, project_id, collection);
create index if not exists asset_search_tsv_idx     on public.asset_search using gin (tsv);
create index if not exists asset_search_trgm_idx    on public.asset_search using gin (body extensions.gin_trgm_ops);

alter table public.asset_search enable row level security;

drop policy if exists "own search rows" on public.asset_search;
create policy "own search rows" on public.asset_search
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Read-only for users; only the trigger below writes it.
revoke all on public.asset_search from public, anon, authenticated;
grant select on public.asset_search to authenticated;

create or replace function public.asset_search_tsv(title text, body text) returns tsvector
language sql immutable parallel safe set search_path = '' as $$
  select setweight(to_tsvector('pg_catalog.simple'::regconfig, title), 'A')
      || to_tsvector('pg_catalog.english'::regconfig, body)
      || to_tsvector('pg_catalog.simple'::regconfig, body)
$$;

-- Security definer because users cannot write asset_search themselves; it only ever copies the row
-- being written, so it cannot reach anyone else's data.
create or replace function public.index_asset_for_search() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := public.asset_search_title(new.collection, new.data);
  v_body  text := public.asset_search_text(new.collection, new.data);
begin
  if new.collection = 'links' then
    return null;
  end if;
  insert into public.asset_search (user_id, id, project_id, collection, title, body, tsv)
  values (new.user_id, new.id, new.project_id, new.collection, v_title, v_body, public.asset_search_tsv(v_title, v_body))
  on conflict (user_id, id) do update
    set project_id = excluded.project_id, collection = excluded.collection,
        title = excluded.title, body = excluded.body, tsv = excluded.tsv;
  return null;
end $$;

revoke all on function public.index_asset_for_search() from public, anon, authenticated;

drop trigger if exists assets_index_for_search on public.assets;
create trigger assets_index_for_search after insert or update of data, collection, project_id on public.assets
  for each row execute function public.index_asset_for_search();

-- Index what is already there.
insert into public.asset_search (user_id, id, project_id, collection, title, body, tsv)
select a.user_id, a.id, a.project_id, a.collection, s.title, s.body, public.asset_search_tsv(s.title, s.body)
from public.assets a,
     lateral (select public.asset_search_title(a.collection, a.data) as title,
                     public.asset_search_text(a.collection, a.data) as body) s
where a.collection <> 'links'
on conflict (user_id, id) do nothing;

-- Ranked hits with a short snippet. Security invoker, so RLS applies; the explicit user filter lets the
-- planner use the indexes. p_project_id null searches all of the user's projects.
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
  ), hits as (
    select s.*, q.text as query, q.english, q.simple,
           s.tsv @@ q.english as english_hit,
           s.tsv @@ (q.english || q.simple) as word_hit
    from public.asset_search s, q
    where s.user_id = (select auth.uid())
      and q.text <> ''
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

revoke all on function public.search_assets(text, text, text[], int) from public, anon;
grant execute on function public.search_assets(text, text, text[], int) to authenticated;
