package translation

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EnqueueFn is the dependency services accept to fire translation jobs.
// Using a function type instead of a *pgxpool.Pool keeps services decoupled
// from the database driver - they have a single side-effect to call, nothing
// more. main.go builds the concrete closure that wraps the pool and the
// goroutine launch, so call sites stay one-liners.
type EnqueueFn func(job TranslationJob)

// EnqueueTranslation appends a job to translation_jobs. Designed to be called
// fire-and-forget inside a `go` statement from a content handler:
//
//	go translation.EnqueueTranslation(context.Background(), pool, translation.TranslationJob{
//	    TableName:     "posts",
//	    RecordID:      newPost.ID,
//	    Fields:        map[string]string{"title": newPost.Title, "body": *newPost.Body},
//	    TargetLocales: []string{"vi"},
//	    ContentType:   translation.ContentTypeGeneral,
//	})
//
// Use context.Background() and not the request context: by the time the
// goroutine schedules, the HTTP request that started it is already returned
// to the client, and r.Context() is therefore cancelled.
func EnqueueTranslation(ctx context.Context, pool *pgxpool.Pool, job TranslationJob) error {
	if pool == nil {
		return fmt.Errorf("translation queue: nil pool")
	}
	if job.TableName == "" || job.RecordID == "" {
		return fmt.Errorf("translation queue: table_name and record_id required")
	}
	if len(job.Fields) == 0 {
		return nil
	}
	// Default the direction before defaulting the targets, so the fallback target
	// cannot contradict the source. An unset SourceLocale means "en" (what every
	// pre-000013 call site meant implicitly), and an en-sourced job with no
	// explicit targets still means {'vi'} - preserving the old behavior exactly
	// for any caller not yet converted.
	job.SourceLocale = normalizeLocale(job.SourceLocale)
	if len(job.TargetLocales) == 0 {
		if job.SourceLocale == "en" {
			job.TargetLocales = []string{"vi"}
		} else {
			job.TargetLocales = []string{"en"}
		}
	}
	if job.ContentType == "" {
		job.ContentType = ContentTypeGeneral
	}

	fieldsJSON, err := json.Marshal(job.Fields)
	if err != nil {
		return fmt.Errorf("marshal fields: %w", err)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO translation_jobs
		   (table_name, record_id, fields, source_locale, target_locales, content_type, status)
		 VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
		job.TableName, job.RecordID, fieldsJSON, job.SourceLocale, job.TargetLocales, string(job.ContentType),
	)
	return err
}
