// Command repair-translations purges AI translations that were silently
// truncated by the gemini-2.5-flash thinking-token bug (see
// docs/agents/known-quirks.md, "Vietnamese AI translations truncated to a
// single word") and re-enqueues translation jobs so the worker re-translates
// the affected records through the fixed code path.
//
// Deleting the rows alone is not enough: translation only runs when a job is
// enqueued at content-write time, so without re-enqueueing, purged records
// would serve the English COALESCE fallback until an admin happened to edit
// them. The jobs are rebuilt from the purged rows themselves - they already
// carry (table_name, record_id, field_name, source_text) - so no source-table
// schema knowledge is needed here.
//
// Scope: every row with is_ai_generated = true AND approved_by IS NULL. That
// is broader than the provably-truncated set, but unapproved AI rows are
// disposable by design (the cache re-fills on the next job) and a full sweep
// guarantees no stump survives. Human-approved rows are never touched.
//
// Usage, from the backend/ directory (reads DATABASE_URL from .env):
//
//	go run ./cmd/repair-translations           # dry run - report only
//	go run ./cmd/repair-translations -apply    # purge + re-enqueue
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

const poisonedWhere = `is_ai_generated = true AND approved_by IS NULL`

func main() {
	apply := flag.Bool("apply", false, "actually purge and re-enqueue (default is a dry-run report)")
	flag.Parse()

	_ = godotenv.Load(".env")
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Println("connect:", err)
		os.Exit(1)
	}
	defer pool.Close()

	report(ctx, pool)

	if !*apply {
		fmt.Println("\nDry run only. Re-run with -apply to purge and re-enqueue.")
		return
	}

	// One statement, atomic by definition: the jobs are aggregated from the
	// exact rows the DELETE returns, so nothing can slip between the purge
	// and the re-enqueue. content_type is forced to 'general' because the
	// Claude fallback path requires ANTHROPIC_API_KEY, which this environment
	// does not have - a 'pastoral' job would just fail its 3 retries.
	var deleted, enqueued int
	err = pool.QueryRow(ctx, `
		WITH purged AS (
		  DELETE FROM translations
		  WHERE `+poisonedWhere+`
		  RETURNING table_name, record_id, field_name, locale, source_text
		),
		grouped AS (
		  SELECT table_name, record_id,
		         jsonb_object_agg(field_name, source_text) AS fields,
		         array_agg(DISTINCT locale)                AS locales
		  FROM purged
		  GROUP BY table_name, record_id
		),
		queued AS (
		  INSERT INTO translation_jobs
		    (table_name, record_id, fields, target_locales, content_type, status)
		  SELECT table_name, record_id, fields, locales, 'general', 'pending'
		  FROM grouped
		  RETURNING id
		)
		SELECT (SELECT count(*) FROM purged), (SELECT count(*) FROM queued)`,
	).Scan(&deleted, &enqueued)
	if err != nil {
		fmt.Println("apply failed:", err)
		os.Exit(1)
	}
	fmt.Printf("\nPurged %d translation rows, enqueued %d re-translation jobs.\n", deleted, enqueued)
	fmt.Println("Start the backend (go run ./cmd/server) and the worker will drain the queue.")
}

// report prints what the purge would touch, worst truncations first, plus the
// human-approved rows it will spare - those need a human eye instead, in case
// someone approved a truncated stump before the bug was found.
func report(ctx context.Context, pool *pgxpool.Pool) {
	var poisoned, approved int
	if err := pool.QueryRow(ctx,
		`SELECT
		   count(*) FILTER (WHERE `+poisonedWhere+`),
		   count(*) FILTER (WHERE approved_by IS NOT NULL)
		 FROM translations`,
	).Scan(&poisoned, &approved); err != nil {
		fmt.Println("count query failed:", err)
		os.Exit(1)
	}
	fmt.Printf("Unapproved AI rows to purge: %d\n", poisoned)
	fmt.Printf("Human-approved rows spared:  %d  (review manually if any look truncated)\n", approved)

	rows, err := pool.Query(ctx, `
		SELECT table_name, field_name, locale,
		       left(source_text, 44), left(translated_text, 44),
		       length(translated_text)::float / greatest(length(source_text), 1) AS ratio
		FROM translations
		WHERE `+poisonedWhere+`
		ORDER BY ratio ASC
		LIMIT 20`)
	if err != nil {
		fmt.Println("preview query failed:", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Println("\nWorst output/source length ratios (likeliest truncations first):")
	for rows.Next() {
		var table, field, locale, src, dst string
		var ratio float64
		if err := rows.Scan(&table, &field, &locale, &src, &dst, &ratio); err != nil {
			fmt.Println("scan failed:", err)
			os.Exit(1)
		}
		fmt.Printf("  %-16s %-10s %s  %.2f  %-46q -> %q\n", table, field, locale, ratio, src, dst)
	}
	if rows.Err() != nil {
		fmt.Println("preview rows failed:", rows.Err())
		os.Exit(1)
	}

	// Approved rows are never purged, but a human may have approved a stump
	// before the bug was found - surface any approved translation that is
	// suspiciously short next to its source so a human can re-review it.
	suspect, err := pool.Query(ctx, `
		SELECT table_name, field_name, locale,
		       left(source_text, 44), left(translated_text, 44)
		FROM translations
		WHERE approved_by IS NOT NULL
		  AND length(translated_text)::float / greatest(length(source_text), 1) < 0.5
		ORDER BY length(translated_text)::float / greatest(length(source_text), 1) ASC`)
	if err != nil {
		fmt.Println("suspect query failed:", err)
		os.Exit(1)
	}
	defer suspect.Close()

	found := false
	for suspect.Next() {
		var table, field, locale, src, dst string
		if err := suspect.Scan(&table, &field, &locale, &src, &dst); err != nil {
			fmt.Println("suspect scan failed:", err)
			os.Exit(1)
		}
		if !found {
			fmt.Println("\nWARNING - approved rows that look truncated (re-review these by hand):")
			found = true
		}
		fmt.Printf("  %-16s %-10s %s  %-46q -> %q\n", table, field, locale, src, dst)
	}
	if suspect.Err() != nil {
		fmt.Println("suspect rows failed:", suspect.Err())
		os.Exit(1)
	}
	if !found {
		fmt.Println("\nNo approved row looks truncated - human-reviewed data is clean.")
	}
}
