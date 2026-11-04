#!/usr/bin/env bash
# End-to-end check of dev-studio-mcp against a LOCAL Supabase stack in Docker. Never talks to production.
#   1. starts the local stack (the repo's migrations apply on start) unless one is already running,
#   2. builds the MCP server and the Dev Studio app pointed at it, starts the app with `next start`,
#   3. runs packages/mcp/e2e/run.ts: two users, the OAuth 2.1 PKCE sign-in, every tool and prompt over stdio,
#      Playwright on the app at 1440×900 and 390×844, RLS checks for user B and an OAuth (client_id) token,
#   4. stops the app, and the stack if this script started it.
# Usage: scripts/mcp-e2e.sh            (needs Docker, the Supabase CLI and `npx playwright install chromium`)
#        KEEP_STACK=1 scripts/mcp-e2e.sh   leaves the stack running afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_PORT="${APP_PORT:-3000}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mcp-e2e.XXXXXX")"
APP_PID=""
STARTED_STACK=""

cleanup() {
  local status=$?
  [ -n "$APP_PID" ] && kill "$APP_PID" 2> /dev/null || true
  if [ -n "$STARTED_STACK" ] && [ -z "${KEEP_STACK:-}" ]; then
    echo "Stopping the local stack…"
    supabase stop --no-backup > /dev/null || true
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT

command -v supabase > /dev/null || { echo "Needs the Supabase CLI (brew install supabase/tap/supabase)."; exit 1; }
docker info > /dev/null 2>&1 || { echo "Needs Docker running."; exit 1; }

# Auth's Site URL must be the local app: the OAuth server sends people to <Site URL>/oauth/consent and only takes
# consent calls from that origin. config.toml keeps the production value, so it is overridden for this stack only.
export SUPABASE_AUTH_SITE_URL="http://localhost:${APP_PORT}"
# Only what the check uses: Postgres, Auth, PostgREST, Realtime, Kong and Mailpit (for the sign-in email).
start_stack() {
  supabase start -x studio,edge-runtime,imgproxy,vector,logflare,postgres-meta,supavisor,storage-api > "$WORK/stack.log" 2>&1 || { cat "$WORK/stack.log"; exit 1; }
}
if supabase status > /dev/null 2>&1; then
  if ! docker inspect "supabase_auth_$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)" --format '{{range .Config.Env}}{{println .}}{{end}}' 2> /dev/null | grep -qx "GOTRUE_SITE_URL=$SUPABASE_AUTH_SITE_URL"; then
    echo "Restarting the running local stack with Site URL $SUPABASE_AUTH_SITE_URL (its data is kept)…"
    supabase stop > /dev/null
    start_stack
  fi
else
  echo "Starting the local Supabase stack…"
  start_stack
  STARTED_STACK=1
fi

# Keys and URLs come from the running stack; they are the CLI's well-known local defaults.
eval "$(supabase status -o env 2> /dev/null | sed -n 's/^\([A-Z_]*\)=\(.*\)$/export SB_\1=\2/p')"
case "${SB_API_URL:-}" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) echo "Refusing to run: the stack's API URL is '${SB_API_URL:-}', not a local address."; exit 1 ;;
esac
export E2E_SUPABASE_URL="$SB_API_URL"
export E2E_ANON_KEY="${SB_ANON_KEY:-${SB_PUBLISHABLE_KEY:-}}"
export E2E_SERVICE_KEY="${SB_SERVICE_ROLE_KEY:-${SB_SECRET_KEY:-}}"
export E2E_JWT_SECRET="${SB_JWT_SECRET:-}"
export E2E_MAILPIT_URL="${SB_MAILPIT_URL:-${SB_INBUCKET_URL:-http://127.0.0.1:54324}}"
export E2E_APP_URL="http://localhost:${APP_PORT}"
export E2E_WORK="$WORK"

echo "Building the MCP server…"
npm run build -w dev-studio-mcp > "$WORK/mcp-build.log" 2>&1 || { cat "$WORK/mcp-build.log"; exit 1; }

echo "Building Dev Studio against the local stack…"
export NEXT_PUBLIC_APP=dev-studio NEXT_PUBLIC_SUPABASE_URL="$E2E_SUPABASE_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$E2E_ANON_KEY"
npx next build > "$WORK/app-build.log" 2>&1 || { tail -50 "$WORK/app-build.log"; exit 1; }
npx next start -p "$APP_PORT" > "$WORK/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "$E2E_APP_URL" && break
  sleep 1
done
curl -sf -o /dev/null "$E2E_APP_URL" || { cat "$WORK/app.log"; echo "The app did not start."; exit 1; }

npx tsx packages/mcp/e2e/run.ts
