// Package analytics holds the background maintenance for the analytics
// tables: rolling raw events up into analytics_daily, flushing the request
// stats the logger middleware collects, and pruning raw rows past retention.
//
// It is a sibling of internal/translation, not part of it, because the two
// workers have nothing in common beyond the ticker shape - and that shape is
// small enough to repeat rather than abstract.
package analytics

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/service"
)

const (
	defaultInterval = 10 * time.Minute
	pruneEvery      = 24 * time.Hour
	shutdownBudget  = 5 * time.Second
)

// Rollup is the worker. Same Start/Stop/once shape as translation.Worker so
// main.go wires it the same way.
type Rollup struct {
	svc      *service.AnalyticsService
	stats    *middleware.RequestStats
	interval time.Duration

	cancel    context.CancelFunc
	done      chan struct{}
	once      sync.Once
	lastPrune time.Time
}

func NewRollup(svc *service.AnalyticsService, stats *middleware.RequestStats, interval time.Duration) *Rollup {
	if interval <= 0 {
		interval = defaultInterval
	}
	return &Rollup{
		svc:      svc,
		stats:    stats,
		interval: interval,
		done:     make(chan struct{}),
	}
}

// Start launches the goroutine; a second call is a no-op.
func (w *Rollup) Start(ctx context.Context) {
	w.once.Do(func() {
		runCtx, cancel := context.WithCancel(ctx)
		w.cancel = cancel
		go w.run(runCtx)
	})
}

// Stop cancels the loop, waits for it, then flushes whatever request stats
// are still in memory - including the current, partial hour - so a deploy
// does not lose the last fifty-nine minutes of latency data. The repository
// merges a partial bucket with whatever the next process writes for the same
// hour.
func (w *Rollup) Stop() {
	if w.cancel == nil {
		return
	}
	w.cancel()
	<-w.done

	ctx, cancel := context.WithTimeout(context.Background(), shutdownBudget)
	defer cancel()
	w.flushStats(ctx, time.Now().Add(24*time.Hour))
}

func (w *Rollup) run(ctx context.Context) {
	defer close(w.done)
	log.Printf("analytics rollup started (interval=%s)", w.interval)

	// One tick right away so a fresh deploy has today's numbers within
	// seconds rather than after the first full interval.
	w.tick(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("analytics rollup stopped")
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *Rollup) tick(ctx context.Context) {
	if err := w.svc.RollupRecent(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("analytics rollup: %v", err)
	}
	w.flushStats(ctx, time.Now())
	if time.Since(w.lastPrune) >= pruneEvery {
		n, err := w.svc.Prune(ctx)
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("analytics prune: %v", err)
		} else if err == nil {
			w.lastPrune = time.Now()
			if n > 0 {
				log.Printf("analytics prune: removed %d raw events past retention", n)
			}
		}
	}
}

// flushStats moves completed hourly buckets from memory to the database.
// Buckets are converted from the middleware's type to the model's so the
// service layer never imports middleware.
func (w *Rollup) flushStats(ctx context.Context, before time.Time) {
	if w.stats == nil {
		return
	}
	snapshot := w.stats.Snapshot(before)
	if len(snapshot) == 0 {
		return
	}
	rows := make([]model.RequestBucket, 0, len(snapshot))
	for _, b := range snapshot {
		rows = append(rows, model.RequestBucket{
			Hour: b.Hour, Route: b.Route, StatusClass: b.StatusClass,
			Count: b.Count, P50Ms: b.P50Ms, P95Ms: b.P95Ms,
		})
	}
	if err := w.svc.FlushRequestStats(ctx, rows); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("analytics request stats flush: %v", err)
	}
}
