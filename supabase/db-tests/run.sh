#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres 17 (same major version as supabase/config.toml)
# with a minimal Supabase stub, seeds duplicate issue keys and ADR numbers right before the
# unique-index migration, then runs test.sql. Needs Docker; no Supabase project or keys.
set -euo pipefail
cd "$(dirname "$0")"
NAME="dev-studio-db-test-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:17 >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q; do sleep 0.5; done
sleep 1

run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$1"; }

run supabase-stub.sql
for migration in ../migrations/*.sql; do
  [[ "$(basename "$migration")" == 20261104100200_* ]] && run seed-duplicates.sql
  echo "== $(basename "$migration")"
  run "$migration"
done
run test.sql
run test-sharing.sql
