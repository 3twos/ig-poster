#!/usr/bin/env bash
# Detect uncommitted Drizzle schema changes.
# Runs `drizzle-kit generate` with a dummy DB URL (no connection needed)
# and fails if new migration files are produced — meaning schema.ts was
# changed without committing a corresponding migration.

set -euo pipefail

POSTGRES_URL="postgresql://check@localhost/check" npx --no-install drizzle-kit generate 2>&1

# Check if drizzle-kit created any new/modified files
if [ -n "$(git diff --name-only -- drizzle/)" ] || [ -n "$(git ls-files --others --exclude-standard -- drizzle/)" ]; then
  echo ""
  echo "ERROR: Uncommitted Drizzle migration files detected."
  echo "Run 'npm run db:generate' and commit the resulting migration."
  exit 1
fi

echo "Schema is in sync with migrations."
