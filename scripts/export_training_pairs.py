#!/usr/bin/env python3
"""Export approved translation pairs as fine-tuning training data.

Pulls every fine_tuning_examples row not yet consumed by a training run
(used_in_training = FALSE) plus the live system prompt from system_prompts,
and writes HuggingFace SFTTrainer-compatible JSONL:

    {"messages": [{"role": "system", ...}, {"role": "user", ...},
                  {"role": "assistant", ...}],
     "metadata": {...}}

Output lands in fine_tuning_data/training_YYYY-MM-DD.jsonl at the repo root.

This script deliberately does NOT flip used_in_training to TRUE - exporting
is lossless and repeatable. Marking pairs as consumed is the training
pipeline's job (Phase 1+ in docs/FINE_TUNING_PLAN.md), done only after a
training run actually used them.

Usage:
    export DATABASE_URL="postgres://..."     # same var sync-prompt.sh uses
    python scripts/export_training_pairs.py
    python scripts/export_training_pairs.py --dry-run   # summary only, no file

When DATABASE_URL is not set, backend/.env (the gitignored local-dev env
file) is parsed as a fallback, matching how the Go backend loads it locally.

Requires: psycopg2 (pip install psycopg2-binary)
"""

import argparse
import json
import os
import sys
from collections import Counter
from datetime import date
from pathlib import Path

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 is required: pip install psycopg2-binary")

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "fine_tuning_data"

# Mirrors translation.SystemPromptKey in backend/internal/translation/prompt.go -
# the exact row the Go worker reads, so training data carries the same system
# message the model will see at inference time.
SYSTEM_PROMPT_KEY = "vi_translation"


def load_database_url():
    """DATABASE_URL from the environment, else from backend/.env.

    The env var takes priority so CI / production shells behave like
    scripts/sync-prompt.sh. The .env fallback exists because local dev keeps
    the URL in backend/.env (gitignored) rather than the shell profile.
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        return url

    env_file = REPO_ROOT / "backend" / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    sys.exit(
        "DATABASE_URL is not set and backend/.env has no DATABASE_URL line.\n"
        "  export DATABASE_URL=\"postgres://...\"  (same value sync-prompt.sh uses)"
    )


def fetch_system_prompt(cur):
    """The current prompt body - becomes the system message of every record."""
    cur.execute(
        "SELECT content, version FROM system_prompts WHERE key = %s",
        (SYSTEM_PROMPT_KEY,),
    )
    row = cur.fetchone()
    if row is None:
        sys.exit(
            f"No system_prompts row with key '{SYSTEM_PROMPT_KEY}'. "
            "Run scripts/sync-prompt.sh first."
        )
    return row[0], row[1]


def fetch_unused_pairs(cur):
    cur.execute(
        """
        SELECT id, source_en, approved_vi, content_type, source_field,
               record_table, record_id, approved_by, approved_at
        FROM fine_tuning_examples
        WHERE used_in_training = FALSE
        ORDER BY approved_at
        """
    )
    return cur.fetchall()


def to_jsonl_record(row, system_prompt):
    (_, source_en, approved_vi, content_type, source_field,
     record_table, record_id, approved_by, approved_at) = row
    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": source_en},
            {"role": "assistant", "content": approved_vi},
        ],
        "metadata": {
            "content_type": content_type,
            "source_field": source_field,
            "record_table": record_table,
            "record_id": str(record_id),
            "approved_by": approved_by,
            "approved_at": approved_at.isoformat(),
        },
    }


def print_summary(rows, prompt_version):
    by_content_type = Counter(r[3] for r in rows)
    by_source_field = Counter(r[4] for r in rows)

    print(f"Total pairs (used_in_training = FALSE): {len(rows)}")
    print(f"System prompt version: {prompt_version}")
    print("\nBy content_type:")
    for key, count in sorted(by_content_type.items()):
        print(f"  {key:12s} {count}")
    print("\nBy source_field:")
    for key, count in sorted(by_source_field.items()):
        print(f"  {key:12s} {count}")


def main():
    parser = argparse.ArgumentParser(
        description="Export unused fine-tuning pairs as SFTTrainer JSONL."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the summary without writing any file",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(load_database_url())
    try:
        with conn.cursor() as cur:
            system_prompt, prompt_version = fetch_system_prompt(cur)
            rows = fetch_unused_pairs(cur)
    finally:
        conn.close()

    print_summary(rows, prompt_version)

    if args.dry_run:
        print("\n--dry-run: no file written.")
        return
    if not rows:
        print("\nNothing to export: no file written.")
        return

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"training_{date.today().isoformat()}.jsonl"
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            record = to_jsonl_record(row, system_prompt)
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(rows)} records to {out_path.relative_to(REPO_ROOT)}")
    print("used_in_training was NOT modified - re-export is safe; marking pairs")
    print("consumed is the training script's job (see docs/FINE_TUNING_PLAN.md).")


if __name__ == "__main__":
    main()
