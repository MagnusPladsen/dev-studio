-- Lets a signed-in user delete their own account from the app (GDPR art. 17), without a service-role key anywhere.
--
-- `security definer` runs the body as the function's owner, which may delete from auth.users. The body only ever
-- touches the caller's own id (auth.uid() from their JWT), so no one can delete someone else. Projects and assets
-- would cascade from auth.users anyway; deleting them first keeps that explicit. Sessions and identities cascade too.

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
  -- Tokens issued to OAuth clients (the MCP server) promise "no deletes"; only the app itself may delete an account.
  if auth.jwt() ->> 'client_id' is not null then
    raise exception using errcode = '42501', message = 'Accounts can only be deleted from the app';
  end if;
  delete from public.assets where user_id = caller;
  delete from public.projects where user_id = caller;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
