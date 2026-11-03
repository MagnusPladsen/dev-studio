# MCP sign-in: owner setup and checks

How `dev-studio-mcp` signs in, what the app side does, and the one-time Supabase dashboard steps. Build step 3 of the
MCP design (`docs/mcp-design.md` §5, §7.4, §9; that doc is not in the repo yet).

## How it works

1. The MCP server listens on `http://127.0.0.1:53682/callback` (or 53683–53685 if taken), makes a PKCE verifier +
   `state`, and opens `https://<ref>.supabase.co/auth/v1/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&state=…&scope=openid email profile`.
2. Supabase sends the browser to Site URL + `/oauth/consent?authorization_id=…`, which is
   `https://gamedev-studio.pladsen.dev/oauth/consent` for both apps (Site URL is the GameDev Studio domain).
3. The consent page (`src/app/oauth/consent/page.tsx`) signs the person in if needed (GitHub or email link; it comes
   back to the same request afterwards), shows the client, the account and what it can do, and calls
   `supabase.auth.oauth.approveAuthorization` / `denyAuthorization`. It then follows the returned `redirect_url`.
4. The MCP server checks `state` and exchanges code + verifier at `POST /auth/v1/oauth/token` (public client, no
   secret). The access token carries `client_id`.
5. The studio's sidebar has **Use with Claude**: setup commands and **Connected apps** (`oauth.listGrants()`,
   **Disconnect** = `oauth.revokeGrant({ clientId })`).

## Owner steps in the Supabase dashboard

Do these once in the production project (`lznqrdbvamheoisjaoqr`). No keys or secrets are involved: the client is
public.

1. **Authentication → URL Configuration**: check **Site URL** is `https://gamedev-studio.pladsen.dev` (it is in
   `supabase/config.toml`). The consent URL is built from it.
2. **Authentication → OAuth Server**:
   - turn on **Enable the Supabase OAuth Server**;
   - **Authorization Path**: `/oauth/consent`;
   - leave **Allow Dynamic OAuth Apps** (dynamic client registration) **off**.
3. **Authentication → OAuth Apps → Add a new client**:
   - **Client name**: `Dev Studio & GameDev Studio for Claude` (people see this on the consent page and under
     Connected apps);
   - **Client type**: **Public** (token endpoint auth method `none`, PKCE required);
   - **Redirect URIs**, all four, exactly (Supabase matches the port too):
     - `http://127.0.0.1:53682/callback`
     - `http://127.0.0.1:53683/callback`
     - `http://127.0.0.1:53684/callback`
     - `http://127.0.0.1:53685/callback`
   - **Client URI** (optional): `https://gamedev-studio.pladsen.dev`; logo optional.
   - Create, then copy the **Client ID** (a UUID). It is public: it goes into the MCP package as `STUDIO_CLIENT_ID`'s
     default (step 4 of the build).
4. **Authentication → URL Configuration → Redirect URLs**: add the four
   `http://127.0.0.1:5368X/callback**` entries from `supabase/config.toml`. Only the `/auth/cli` fallback needs them
   (normal sign-in redirects; Supabase may already accept loopback addresses without them).
5. Run the round trip below.

`supabase/config.toml` now has `[auth.oauth_server] enabled = true` and the loopback redirect URLs, so the local stack
(`supabase start`) and `supabase config push` match. The OAuth client itself is not in `config.toml`; register it in
the dashboard (step 3) for production and again for a local stack if you test there.

## Round trip (needs the steps above)

```bash
SUPABASE_URL=https://lznqrdbvamheoisjaoqr.supabase.co CLIENT_ID=<client id from step 3> SUPABASE_ANON_KEY=<publishable key> scripts/mcp-oauth-roundtrip.sh
```

It opens the authorize URL, waits on `127.0.0.1:53682`, checks `state`, exchanges the code, prints the access token's
claims (expect `client_id`), checks a reused code fails, reads `projects` under RLS, refreshes (expect rotation),
then asks you to press **Disconnect** under Use with Claude and checks the refresh token stops working. It prints no
tokens. The consent page must be deployed first (this branch on `main`, or a preview on the Site URL).

Also try by hand: signed out on the consent page → sign in with GitHub → you land back on the same request; Deny →
the script reports `access_denied`.

## The `/auth/cli` fallback

For when the beta OAuth server can't be used. Off by default.

- **Switch**: Vercel env `NEXT_PUBLIC_MCP_CLI_AUTH=on` on the GameDev Studio project (redeploy). The MCP server uses
  it when started with `STUDIO_AUTH=cli`.
- **Flow**: the MCP server keeps its PKCE verifier, listens on a loopback port and opens
  `/auth/cli?port=<53682-53685>&state=<16-128 base64url chars>&code_challenge=<S256, base64url>`. The page signs in
  **for the server**: GitHub goes to `/auth/v1/authorize?provider=github&redirect_to=<loopback>?state=…&code_challenge=…`,
  email posts `/auth/v1/otp` with the challenge. Supabase redirects to the loopback with `?code=`, and the server
  exchanges it at `POST /auth/v1/token?grant_type=pkce` (`{ auth_code, code_verifier }`), as supabase-js does.
- **Differs from the design doc**: the design described handing the browser's session over. That makes the browser
  and Claude share one rotating refresh token, and reuse detection then signs both out. This version gives Claude a
  session of its own without a service-role key, and the page never sees a token.
- **Limits**: the email link has to be opened on the computer running Claude (it lands on `127.0.0.1`); tokens have
  no `client_id`, so restrictive RLS policies for MCP tokens don't apply and Connected apps can't list it. Revoke
  with the MCP's `logout` (signs that session out).

## Verified vs assumed (2026-11-03)

Verified against the docs and `@supabase/auth-js` 2.118.0 (installed):

- `supabase.auth.oauth.getAuthorizationDetails(id)` → `OAuthAuthorizationDetails` (`authorization_id`,
  `redirect_uri`, `client { id, name, uri, logo_uri }`, `user { id, email }`, `scope`) or `OAuthRedirect`
  (`redirect_url`) when already consented; `approveAuthorization` / `denyAuthorization(id, { skipBrowserRedirect })`;
  `listGrants()` → `{ client, scopes, granted_at }[]`; `revokeGrant({ clientId })` (DELETE
  `/user/oauth/grants?client_id=`). Source: `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`
  (`AuthOAuthServerApi`) and [getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started).
- Consent URL is Site URL + Authorization Path with `?authorization_id=`; dashboard paths Authentication → OAuth Server
  and → OAuth Apps; client types Public / Confidential.
  [Getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
  [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).
- Token endpoint `POST /auth/v1/oauth/token`, form-encoded, public clients send `client_id` only; refresh with
  `grant_type=refresh_token`, rotated. [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).
- `config.toml` keys `[auth.oauth_server] enabled`, `authorization_url_path`, `allow_dynamic_registration` (present
  in this repo's file and in Supabase's [UI library MCP guide](https://github.com/supabase/supabase/blob/master/apps/ui-library/content/docs/headless/mcp.mdx)).
- PKCE code exchange for `/auth/cli`: `POST /auth/v1/token?grant_type=pkce` with `{ auth_code, code_verifier }`, and
  `/otp` / `/authorize` take `code_challenge` + `code_challenge_method` (auth-js 2.118 `GoTrueClient.js`)..

Assumed (checked by the round trip, not yet run):

- The authorize endpoint is `/auth/v1/oauth/authorize` with standard parameters (the docs show it; not called yet).
- `authorization_id` is URL-safe (the page accepts `[A-Za-z0-9_-]{1,256}`); if Supabase ever uses other characters
  the page says the request isn't valid.
- Access tokens stay valid up to an hour after Disconnect (the dialog says so).
- `/auth/cli`: hosted Supabase accepts the loopback `redirect_to` with `?state=` (the allow-list globs cover it) and
  `/otp` with `code_challenge` sends a PKCE magic link (supabase-js does the same).
- An email link opened in another browser than the consent page's doesn't bring that page along; GitHub sign-in or
  the same browser does.
