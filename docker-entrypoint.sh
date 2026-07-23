#!/bin/sh
# Boot sequence for the Clarity CRM container.
#
# The Prisma client is compiled into the server bundle at build time, so this
# image serves exactly one database provider. The check below turns a mismatch
# into an immediate, explicit failure — without it the app boots, serves /login
# with a 200, and returns 500 on every query. That was observed, not imagined:
# docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md (R1)
set -e

DB_URL="${DATABASE_URL:-file:./data/clarity.db}"

case "$DB_URL" in
  file:*)                        RUNTIME_PROVIDER=sqlite ;;
  postgres://*|postgresql://*)   RUNTIME_PROVIDER=postgres ;;
  *)
    echo "FATAL: unsupported DATABASE_URL \"$DB_URL\"." >&2
    echo "Use file: (SQLite) or postgres:// / postgresql:// (Postgres)." >&2
    exit 1
    ;;
esac

BAKED="${CLARITY_DB_PROVIDER:-sqlite}"

if [ "$RUNTIME_PROVIDER" != "$BAKED" ]; then
  echo "FATAL: this image was built for '$BAKED', but DATABASE_URL is '$RUNTIME_PROVIDER'." >&2
  echo "The Prisma client is compiled into the server bundle and cannot be swapped at runtime." >&2
  echo "Rebuild for the provider you want:" >&2
  echo "  docker build --build-arg DB_PROVIDER=$RUNTIME_PROVIDER -t clarity-crm ." >&2
  echo "or, with compose:" >&2
  echo "  docker compose -f docker-compose.postgres.yml up -d --build   # Postgres" >&2
  echo "  docker compose up -d --build                                  # SQLite" >&2
  exit 1
fi

export DATABASE_URL="$DB_URL"

# `db push` with no data-loss override flag: additive changes apply, destructive
# ones stop the boot rather than silently dropping data.
echo "clarity: applying schema (provider: $BAKED)..."
npm run db:push

echo "clarity: starting server on port ${PORT:-3000}..."
exec node server.js
