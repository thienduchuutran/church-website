package translation

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultInterval = 5 * time.Second
	maxAttempts     = 3
	batchSize       = 5
)

// Worker polls translation_jobs on a ticker, claims pending rows with
// FOR UPDATE SKIP LOCKED, and hands each job to the Translator. The SKIP
// LOCKED clause is what makes this safe under horizontal scaling - two
// backend instances polling at once will never grab the same row.
type Worker struct {
	translator *Translator
	pool       *pgxpool.Pool
	interval   time.Duration

	cancel context.CancelFunc
	done   chan struct{}
	once   sync.Once
}

func NewWorker(translator *Translator, pool *pgxpool.Pool, interval time.Duration) *Worker {
	if interval <= 0 {
		interval = defaultInterval
	}
	return &Worker{
		translator: translator,
		pool:       pool,
		interval:   interval,
		done:       make(chan struct{}),
	}
}

// Start launches the background goroutine. Calling Start more than once is
// a no-op (sync.Once), so accidental double-start during init is harmless.
func (w *Worker) Start(ctx context.Context) {
	w.once.Do(func() {
		runCtx, cancel := context.WithCancel(ctx)
		w.cancel = cancel
		go w.run(runCtx)
	})
}

// Stop cancels the worker context and waits for the goroutine to exit. Safe
// to call before Start (no-op) so deferred Stop() in main never panics.
func (w *Worker) Stop() {
	if w.cancel == nil {
		return
	}
	w.cancel()
	<-w.done
}

func (w *Worker) run(ctx context.Context) {
	defer close(w.done)
	log.Printf("translation worker started (interval=%s, batch=%d, max_attempts=%d)", w.interval, batchSize, maxAttempts)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("translation worker stopped")
			return
		case <-ticker.C:
			if err := w.tick(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Printf("translation worker tick error: %v", err)
			}
		}
	}
}

// tick claims up to batchSize pending jobs in a single short transaction,
// flips their status to 'processing', then releases the locks and processes
// them outside the transaction. Holding the lock only during the claim keeps
// the transaction short - long-running model calls do not block other
// workers from picking up unrelated jobs.
func (w *Worker) tick(ctx context.Context) error {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx,
		`SELECT id, table_name, record_id, fields, source_locale, target_locales, content_type, attempts
		 FROM translation_jobs
		 WHERE status = 'pending' AND attempts < $1
		 ORDER BY created_at ASC
		 LIMIT $2
		 FOR UPDATE SKIP LOCKED`,
		maxAttempts, batchSize,
	)
	if err != nil {
		return err
	}

	var jobs []TranslationJob
	for rows.Next() {
		var (
			j         TranslationJob
			fieldsRaw []byte
			ct        string
		)
		if err := rows.Scan(&j.ID, &j.TableName, &j.RecordID, &fieldsRaw, &j.SourceLocale, &j.TargetLocales, &ct, &j.Attempts); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(fieldsRaw, &j.Fields); err != nil {
			log.Printf("translation worker: bad fields JSON on job %s: %v", j.ID, err)
			continue
		}
		j.ContentType = ContentType(ct)
		jobs = append(jobs, j)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(jobs) == 0 {
		return tx.Commit(ctx)
	}

	for _, j := range jobs {
		if _, err := tx.Exec(ctx,
			`UPDATE translation_jobs
			 SET status = 'processing', attempts = attempts + 1
			 WHERE id = $1`,
			j.ID,
		); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	for _, j := range jobs {
		w.process(ctx, j)
	}
	return nil
}

// process runs one job and writes the final status. job.Attempts is the
// pre-claim count, so the post-claim attempts in the DB is job.Attempts+1.
// Compare against maxAttempts to decide whether a failure becomes a retry
// (status='pending', the next tick picks it up) or a terminal failure
// (status='failed', surfaced via the admin /failed endpoint in Phase 5).
func (w *Worker) process(ctx context.Context, job TranslationJob) {
	start := time.Now()
	log.Printf("translation_start job=%s table=%s record=%s fields=%d attempt=%d", job.ID, job.TableName, job.RecordID, len(job.Fields), job.Attempts+1)

	err := w.translator.TranslateRecord(ctx, job)
	if err == nil {
		if _, dbErr := w.pool.Exec(ctx,
			`UPDATE translation_jobs SET status = 'done', processed_at = now(), error = NULL WHERE id = $1`,
			job.ID,
		); dbErr != nil {
			log.Printf("translation worker: failed to mark job %s done: %v", job.ID, dbErr)
		}
		log.Printf("translation_done job=%s duration_ms=%d", job.ID, time.Since(start).Milliseconds())
		return
	}

	postAttempts := job.Attempts + 1
	if postAttempts >= maxAttempts {
		if _, dbErr := w.pool.Exec(ctx,
			`UPDATE translation_jobs SET status = 'failed', error = $1, processed_at = now() WHERE id = $2`,
			err.Error(), job.ID,
		); dbErr != nil {
			log.Printf("translation worker: failed to mark job %s failed: %v", job.ID, dbErr)
		}
		log.Printf("translation_failed job=%s error=%v attempt=%d", job.ID, err, postAttempts)
		return
	}

	if _, dbErr := w.pool.Exec(ctx,
		`UPDATE translation_jobs SET status = 'pending', error = $1 WHERE id = $2`,
		err.Error(), job.ID,
	); dbErr != nil {
		log.Printf("translation worker: failed to requeue job %s: %v", job.ID, dbErr)
	}
	log.Printf("translation_retry job=%s error=%v attempt=%d", job.ID, err, postAttempts)
}
