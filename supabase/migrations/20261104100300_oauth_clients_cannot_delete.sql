-- Tokens issued to OAuth clients (the dev-studio-mcp server signs in through Supabase's OAuth 2.1
-- server) carry a top-level `client_id` claim; the app's own browser sessions do not. Owner decision:
-- no deletes through MCP tokens, so any OAuth client may read and write a user's rows but never
-- delete them. Restrictive policies are and'ed with "own projects" / "own assets", so browser
-- sessions keep exactly the rights they had.
--
-- Rows removed by the projects → assets foreign key cascade are not checked against RLS; that only
-- happens when a project is deleted, which these policies already refuse to OAuth clients.
drop policy if exists "oauth clients cannot delete projects" on public.projects;
create policy "oauth clients cannot delete projects" on public.projects
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

drop policy if exists "oauth clients cannot delete assets" on public.assets;
create policy "oauth clients cannot delete assets" on public.assets
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);
