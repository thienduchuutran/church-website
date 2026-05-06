#!/usr/bin/env bash
# Migrate data from Supabase Postgres → AWS RDS.
#
# Prerequisites: psql and pg_dump installed locally, network access to both DBs.
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
#   export RDS_URL="postgresql://postgres:<password>@<rds-endpoint>:5432/postgres"
#   bash scripts/migrate-data.sh

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${RDS_URL:-}" ]]; then
  echo "Error: set SUPABASE_DB_URL and RDS_URL before running this script."
  exit 1
fi

DUMP_FILE="/tmp/church_data_$(date +%Y%m%d_%H%M%S).sql"

echo "==> Step 1: apply schema to RDS"
psql "$RDS_URL" -f "$(dirname "$0")/rds-schema.sql"

echo "==> Step 2: dump data from Supabase (data-only, selected tables)"
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --no-acl \
  --disable-triggers \
  -t public.admins \
  -t public.posts \
  -t public.post_images \
  -t public.reactions \
  -t public.page_content \
  -f "$DUMP_FILE"

echo "==> Step 3: restore data into RDS"
psql "$RDS_URL" \
  --set ON_ERROR_STOP=on \
  -f "$DUMP_FILE"

echo "==> Step 4: verify row counts"
for table in admins posts post_images reactions page_content; do
  src=$(psql "$SUPABASE_DB_URL" -t -c "SELECT COUNT(*) FROM public.$table;" | tr -d ' ')
  dst=$(psql "$RDS_URL"         -t -c "SELECT COUNT(*) FROM public.$table;" | tr -d ' ')
  if [[ "$src" == "$dst" ]]; then
    echo "  ✓ $table: $dst rows"
  else
    echo "  ✗ $table: Supabase=$src RDS=$dst - MISMATCH"
  fi
done

echo ""
echo "Done. calendar_events and calendar_month_notes are empty (new tables - nothing to migrate)."
echo ""
echo "Next: update DATABASE_URL in the systemd service on EC2:"
echo "  sudo systemctl edit --full church-backend"
echo "  Set: Environment=DATABASE_URL=\$RDS_URL"
echo "  sudo systemctl daemon-reload && sudo systemctl restart church-backend"
