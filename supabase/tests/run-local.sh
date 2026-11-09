#!/usr/bin/env bash
# Recreates a throwaway database on the local PostgreSQL, applies the shim,
# every migration in order, the demo seed, and runs the SQL test files.
set -euo pipefail
DB=${JUBILATE_TEST_DB:-jubilate_test}
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1)
DIR=$(cd "$(dirname "$0")/.." && pwd)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$DIR/tests/local-shim.sql"
for f in "$DIR"/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
if [ -f "$DIR/seed.sql" ]; then echo "→ seed"; "${PSQL[@]}" -d "$DB" -f "$DIR/seed.sql"; fi
status=0
for t in "$DIR"/tests/[0-9]*.sql; do
  echo "→ test $(basename "$t")"
  if ! "${PSQL[@]}" -d "$DB" -f "$t"; then status=1; fi
done
exit $status
