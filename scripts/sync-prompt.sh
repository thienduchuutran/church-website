#!/usr/bin/env bash
# Sync the markdown prompt source-of-truth into the system_prompts table.
#
# Reads prompts/vi_translation_system_prompt.md, parses YAML front-matter for
# `key` and `version`, and upserts the body into system_prompts. The running
# Go backend's PromptCache (5-minute TTL) will pick up the new prompt without
# a redeploy.
#
# Usage:
#   export DATABASE_URL="postgres://..."
#   bash scripts/sync-prompt.sh
#
# Local Docker DB example:
#   export DATABASE_URL="postgres://postgres:postgres@localhost:5433/postgres"
#   bash scripts/sync-prompt.sh
#
# After sync, optionally re-translate unapproved content with the new prompt:
#   curl -X POST -H "Authorization: Bearer <admin-jwt>" \
#     "$BACKEND_URL/api/v1/admin/translations/retranslate-all"
# (or use the "Re-translate all pending" button on /admin/translations)

set -euo pipefail

PROMPT_FILE="$(dirname "$0")/../prompts/vi_translation_system_prompt.md"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL not set."
  exit 1
fi
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: $PROMPT_FILE not found."
  exit 1
fi

# Parse YAML front-matter. The format is fixed:
#   ---
#   key: <slug>
#   version: <semver>
#   ---
#   <body...>
# We walk the file once with awk, flipping a flag at each `---` line, and
# pull `key:` / `version:` from inside the front-matter block. The body is
# everything after the second `---`.
KEY=$(awk '/^---$/{f=!f; next} f && /^key:/{print $2; exit}' "$PROMPT_FILE")
VERSION=$(awk '/^---$/{f=!f; next} f && /^version:/{print $2; exit}' "$PROMPT_FILE")
BODY=$(awk 'BEGIN{c=0; pr=0} /^---$/{c++; if(c==2){pr=1; next}} pr==1' "$PROMPT_FILE")

if [[ -z "$KEY" || -z "$VERSION" || -z "$BODY" ]]; then
  echo "Error: failed to parse key, version, or body from $PROMPT_FILE"
  echo "  key=[$KEY] version=[$VERSION] body_bytes=${#BODY}"
  exit 1
fi

BYTES=${#BODY}
echo "==> Syncing prompt key=$KEY version=$VERSION ($BYTES bytes)"

# psql -v substitution uses :'name' to quote-and-escape a value as a SQL
# string literal. This is the correct way to inject a multi-line body with
# embedded apostrophes - psql handles all the SQL escaping for us.
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v "key=$KEY" \
  -v "version=$VERSION" \
  -v "body=$BODY" \
  <<'SQL'
INSERT INTO system_prompts (key, content, version, updated_at)
VALUES (:'key', :'body', :'version', now())
ON CONFLICT (key) DO UPDATE SET
  content    = excluded.content,
  version    = excluded.version,
  updated_at = now();

SELECT key, version, length(content) AS bytes, updated_at FROM system_prompts WHERE key = :'key';
SQL

echo "==> Done. PromptCache will refresh within 5 minutes."
echo "    To force re-translation of unapproved content now:"
echo "      POST /api/v1/admin/translations/retranslate-all  (admin auth)"
