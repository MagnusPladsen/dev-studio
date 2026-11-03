-- Data with duplicate issue keys and ADR numbers, written before the unique-index migration runs.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

insert into public.projects (user_id, id, name, data) values
  ('00000000-0000-0000-0000-000000000001', 'p1', 'Tidepool', '{"id":"p1","name":"Tidepool"}'),
  ('00000000-0000-0000-0000-000000000002', 'p2', 'Other', '{"id":"p2","name":"Other"}');

insert into public.assets (user_id, id, project_id, collection, data) values
  ('00000000-0000-0000-0000-000000000001', 'i1', 'p1', 'issues', '{"id":"i1","key":"TIDE-1","title":"First","createdAt":"2026-11-01T10:00:00.000Z"}'),
  ('00000000-0000-0000-0000-000000000001', 'i2', 'p1', 'issues', '{"id":"i2","key":"TIDE-1","title":"Second","createdAt":"2026-11-02T10:00:00.000Z"}'),
  ('00000000-0000-0000-0000-000000000001', 'i3', 'p1', 'issues', '{"id":"i3","key":"TIDE-1","title":"Third","createdAt":"2026-11-03T10:00:00.000Z"}'),
  ('00000000-0000-0000-0000-000000000001', 'i4', 'p1', 'issues', '{"id":"i4","key":"TIDE-7","title":"Seventh","createdAt":"2026-11-01T09:00:00.000Z"}'),
  -- the same key in another user's project is not a duplicate
  ('00000000-0000-0000-0000-000000000002', 'i5', 'p2', 'issues', '{"id":"i5","key":"TIDE-1","title":"Elsewhere"}'),
  ('00000000-0000-0000-0000-000000000001', 'd1', 'p1', 'decisions', '{"id":"d1","number":1,"title":"Use Postgres","createdAt":"2026-11-01T10:00:00.000Z"}'),
  ('00000000-0000-0000-0000-000000000001', 'd2', 'p1', 'decisions', '{"id":"d2","number":1,"title":"Use Realtime","createdAt":"2026-11-02T10:00:00.000Z"}'),
  ('00000000-0000-0000-0000-000000000001', 'd3', 'p1', 'decisions', '{"id":"d3","number":2,"title":"Ship beta","createdAt":"2026-11-01T11:00:00.000Z"}');
