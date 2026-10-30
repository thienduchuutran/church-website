package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// AnalyticsRepository is the only code that touches the three analytics
// tables from migration 000019. No logic here beyond SQL: hashing, clamping
// and bot filtering happen in service.AnalyticsService before a row arrives.
type AnalyticsRepository struct {
	pool *pgxpool.Pool
}

func NewAnalyticsRepository(pool *pgxpool.Pool) *AnalyticsRepository {
	return &AnalyticsRepository{pool: pool}
}

// InsertEvents writes a batch in one multi-row INSERT. One statement per
// batch (not per event) keeps the session-pooler connection busy for a
// single round trip even when a phone flushes twenty queued events at once.
func (r *AnalyticsRepository) InsertEvents(ctx context.Context, events []model.AnalyticsEvent) error {
	if len(events) == 0 {
		return nil
	}
	var sb strings.Builder
	sb.WriteString(`INSERT INTO analytics_events
		(occurred_at, visitor_hash, session_id, event_name, path, locale, referrer_host, device, duration_ms, is_returning, props)
		VALUES `)
	args := make([]any, 0, len(events)*11)
	for i, e := range events {
		if i > 0 {
			sb.WriteString(", ")
		}
		base := i * 11
		sb.WriteString(fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11))
		props, err := json.Marshal(e.Props)
		if err != nil {
			return fmt.Errorf("marshal props: %w", err)
		}
		args = append(args,
			e.OccurredAt, e.VisitorHash, e.SessionID, e.Name, e.Path, e.Locale,
			e.ReferrerHost, e.Device, e.DurationMs, e.Returning, props,
		)
	}
	_, err := r.pool.Exec(ctx, sb.String(), args...)
	return err
}

// RollupDay rebuilds every analytics_daily row for one calendar day. The
// delete-then-insert runs in one transaction so a reader never sees a
// half-built day. `start`/`end` are the UTC instants bracketing the day in
// the site's time zone; `tz` is that zone's name, used for the hour-of-week
// histogram so "Sunday 10am" means Sunday 10am in Saugus.
func (r *AnalyticsRepository) RollupDay(ctx context.Context, day string, start, end time.Time, tz string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM analytics_daily WHERE day = $1::date`, day); err != nil {
		return fmt.Errorf("clear day: %w", err)
	}

	// Each statement below produces (metric, dimension, value) rows for the
	// day. They are separate statements rather than one giant UNION so a
	// future metric is one more block, not a rewrite.
	statements := []string{
		// Unique visitors, total and per locale.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'visitors', '', COUNT(DISTINCT visitor_hash)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'visitors_locale', locale, COUNT(DISTINCT visitor_hash)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY locale`,
		// Sessions, total, per locale, and returning.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'sessions', '', COUNT(DISTINCT session_id)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'sessions_locale', locale, COUNT(DISTINCT session_id)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY locale`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'returning_sessions', '', COUNT(DISTINCT session_id)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND is_returning AND occurred_at >= $2 AND occurred_at < $3`,
		// Pageviews, total and by path / device / referrer / hour-of-week.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'pageviews', '', COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'pageviews_path', path, COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY path`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'pageviews_device', device, COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY device`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'pageviews_referrer', COALESCE(referrer_host, 'direct'), COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY COALESCE(referrer_host, 'direct')`,
		// dimension is "<dow>-<hour>", dow 0 = Sunday, in the site's time zone.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'pageviews_hour',
		        EXTRACT(DOW  FROM occurred_at AT TIME ZONE $4)::int || '-' ||
		        EXTRACT(HOUR FROM occurred_at AT TIME ZONE $4)::int,
		        COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'page_view' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY 3`,
		// Non-pageview events by name, and post reads by post.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'events', event_name, COUNT(*)
		   FROM analytics_events
		  WHERE event_name NOT IN ('page_view', 'page_leave') AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY event_name`,
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'post_reads', props->>'post_id', COUNT(*)
		   FROM analytics_events
		  WHERE event_name = 'post_read' AND props ? 'post_id' AND occurred_at >= $2 AND occurred_at < $3
		  GROUP BY props->>'post_id'`,
		// Median visible seconds per session, from page_leave durations.
		`INSERT INTO analytics_daily (day, metric, dimension, value)
		 SELECT $1::date, 'session_seconds_median', '',
		        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY secs), 0)
		   FROM (SELECT session_id, SUM(duration_ms) / 1000.0 AS secs
		           FROM analytics_events
		          WHERE event_name = 'page_leave' AND duration_ms IS NOT NULL
		            AND occurred_at >= $2 AND occurred_at < $3
		          GROUP BY session_id) s`,
	}
	for _, stmt := range statements {
		// pgx refuses an argument the statement never references, so the
		// time zone is passed only to the hour-of-week histogram.
		args := []any{day, start, end}
		if strings.Contains(stmt, "$4") {
			args = append(args, tz)
		}
		if _, err := tx.Exec(ctx, stmt, args...); err != nil {
			return fmt.Errorf("rollup %s: %w", day, err)
		}
	}
	return tx.Commit(ctx)
}

// SumMetric totals one (metric, dimension) over inclusive calendar days.
func (r *AnalyticsRepository) SumMetric(ctx context.Context, metric, dimension string, from, to time.Time) (float64, error) {
	var v float64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(value), 0)::float8
		   FROM analytics_daily
		  WHERE metric = $1 AND dimension = $2 AND day >= $3::date AND day <= $4::date`,
		metric, dimension, from.Format("2006-01-02"), to.Format("2006-01-02"),
	).Scan(&v)
	return v, err
}

// PeakMetric returns the day with the largest value and that value.
func (r *AnalyticsRepository) PeakMetric(ctx context.Context, metric, dimension string, from, to time.Time) (string, float64, error) {
	var day time.Time
	var v float64
	err := r.pool.QueryRow(ctx,
		`SELECT day, value::float8
		   FROM analytics_daily
		  WHERE metric = $1 AND dimension = $2 AND day >= $3::date AND day <= $4::date
		  ORDER BY value DESC, day DESC
		  LIMIT 1`,
		metric, dimension, from.Format("2006-01-02"), to.Format("2006-01-02"),
	).Scan(&day, &v)
	if err == pgx.ErrNoRows {
		return "", 0, nil
	}
	if err != nil {
		return "", 0, err
	}
	return day.Format("2006-01-02"), v, nil
}

// Series returns the per-day values for one (metric, dimension), ascending.
func (r *AnalyticsRepository) Series(ctx context.Context, metric, dimension string, from, to time.Time) ([]model.AnalyticsPoint, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT day, value::float8
		   FROM analytics_daily
		  WHERE metric = $1 AND dimension = $2 AND day >= $3::date AND day <= $4::date
		  ORDER BY day`,
		metric, dimension, from.Format("2006-01-02"), to.Format("2006-01-02"),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.AnalyticsPoint
	for rows.Next() {
		var day time.Time
		var p model.AnalyticsPoint
		if err := rows.Scan(&day, &p.Value); err != nil {
			return nil, err
		}
		p.Day = day.Format("2006-01-02")
		out = append(out, p)
	}
	return out, rows.Err()
}

// Breakdown sums a dimensioned metric over the range and returns the top
// rows plus the grand total (over all rows, not just the returned ones) so
// the caller can compute shares.
func (r *AnalyticsRepository) Breakdown(ctx context.Context, metric string, from, to time.Time, limit int) ([]model.AnalyticsBreakdownRow, float64, error) {
	fromS, toS := from.Format("2006-01-02"), to.Format("2006-01-02")
	var total float64
	if err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(value), 0)::float8 FROM analytics_daily
		  WHERE metric = $1 AND day >= $2::date AND day <= $3::date`,
		metric, fromS, toS,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.pool.Query(ctx,
		`SELECT dimension, SUM(value)::float8 AS v
		   FROM analytics_daily
		  WHERE metric = $1 AND day >= $2::date AND day <= $3::date
		  GROUP BY dimension
		  ORDER BY v DESC, dimension
		  LIMIT $4`,
		metric, fromS, toS, limit,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []model.AnalyticsBreakdownRow
	for rows.Next() {
		var row model.AnalyticsBreakdownRow
		if err := rows.Scan(&row.Dimension, &row.Value); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	return out, total, rows.Err()
}

// MedianSessionSeconds computes the range-wide median directly from raw
// events. A median of daily medians would be wrong, and at this traffic the
// raw query is cheap.
func (r *AnalyticsRepository) MedianSessionSeconds(ctx context.Context, start, end time.Time) (int, error) {
	var v *float64
	err := r.pool.QueryRow(ctx,
		`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs)
		   FROM (SELECT session_id, SUM(duration_ms) / 1000.0 AS secs
		           FROM analytics_events
		          WHERE event_name = 'page_leave' AND duration_ms IS NOT NULL
		            AND occurred_at >= $1 AND occurred_at < $2
		          GROUP BY session_id) s`,
		start, end,
	).Scan(&v)
	if err != nil {
		return 0, err
	}
	if v == nil {
		return 0, nil
	}
	return int(*v + 0.5), nil
}

// ContentStats lists posts (newest first among equals) with their reads in
// the window and all-time reactions. Posts are matched on the post_id the
// tracker put in props; it is compared as text so a malformed id can never
// make the cast fail.
func (r *AnalyticsRepository) ContentStats(ctx context.Context, start, end time.Time) ([]model.ContentStat, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id::text, p.title, p.type::text, COALESCE(p.created_at, now()),
		        COALESCE(rd.reads, 0), COALESCE(rc.reactions, 0)
		   FROM posts p
		   LEFT JOIN (SELECT props->>'post_id' AS pid, COUNT(*)::int AS reads
		                FROM analytics_events
		               WHERE event_name = 'post_read' AND occurred_at >= $1 AND occurred_at < $2
		               GROUP BY props->>'post_id') rd ON rd.pid = p.id::text
		   LEFT JOIN (SELECT post_id, COUNT(*)::int AS reactions FROM reactions GROUP BY post_id) rc ON rc.post_id = p.id
		  WHERE p.created_at < $2
		  ORDER BY COALESCE(rd.reads, 0) DESC, p.created_at DESC
		  LIMIT 50`,
		start, end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.ContentStat
	for rows.Next() {
		var c model.ContentStat
		if err := rows.Scan(&c.PostID, &c.Title, &c.Type, &c.PublishedAt, &c.Reads, &c.Reactions); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// PipelineStats counts translation work and content velocity in the window.
// "Approved unedited" is approved_at set with is_ai_generated still true -
// the repository's Approve flips that flag only when the reviewer changed
// the text (see repository/translation.go).
func (r *AnalyticsRepository) PipelineStats(ctx context.Context, start, end time.Time) (*model.PipelineStats, error) {
	var (
		s    model.PipelineStats
		lead *float64
	)
	err := r.pool.QueryRow(ctx,
		`SELECT
		   (SELECT COUNT(*) FROM translations WHERE created_at >= $1 AND created_at < $2),
		   (SELECT COUNT(*) FROM translations WHERE approved_at >= $1 AND approved_at < $2 AND is_ai_generated),
		   (SELECT COUNT(*) FROM translations WHERE approved_at >= $1 AND approved_at < $2 AND NOT is_ai_generated),
		   (SELECT COUNT(*) FROM translations WHERE approved_at IS NULL),
		   (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (approved_at - created_at)))
		      FROM translations WHERE approved_at >= $1 AND approved_at < $2),
		   (SELECT COUNT(*) FROM posts WHERE created_at >= $1 AND created_at < $2),
		   (SELECT COUNT(*) FROM reactions WHERE created_at >= $1 AND created_at < $2),
		   (SELECT COUNT(*) FROM fine_tuning_examples WHERE approved_at >= $1 AND approved_at < $2)`,
		start, end,
	).Scan(&s.TranslationsProduced, &s.ApprovedUnedited, &s.ApprovedEdited, &s.PendingReview,
		&lead, &s.PostsPublished, &s.ReactionsAdded, &s.FineTuningPairs)
	if err != nil {
		return nil, err
	}
	if lead != nil {
		v := int(*lead + 0.5)
		s.MedianLeadSeconds = &v
	}
	return &s, nil
}

// PruneBefore deletes raw events older than cutoff and returns how many went.
func (r *AnalyticsRepository) PruneBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx, `DELETE FROM analytics_events WHERE occurred_at < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// UpsertRequestStats merges hourly buckets. A conflict happens when the
// process restarted mid-hour and flushed a partial bucket on the way down:
// counts add, the worst p95 wins, and p50 is re-weighted by count.
func (r *AnalyticsRepository) UpsertRequestStats(ctx context.Context, buckets []model.RequestBucket) error {
	batch := &pgx.Batch{}
	for _, b := range buckets {
		batch.Queue(
			`INSERT INTO analytics_request_stats (hour, route, status_class, count, p50_ms, p95_ms)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (hour, route, status_class) DO UPDATE SET
			   p50_ms = ((analytics_request_stats.p50_ms * analytics_request_stats.count) + (EXCLUDED.p50_ms * EXCLUDED.count))
			            / GREATEST(analytics_request_stats.count + EXCLUDED.count, 1),
			   p95_ms = GREATEST(analytics_request_stats.p95_ms, EXCLUDED.p95_ms),
			   count  = analytics_request_stats.count + EXCLUDED.count`,
			b.Hour, b.Route, b.StatusClass, b.Count, b.P50Ms, b.P95Ms,
		)
	}
	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()
	for range buckets {
		if _, err := results.Exec(); err != nil {
			return err
		}
	}
	return nil
}

// RouteStats aggregates hourly rows per route over [start, end).
func (r *AnalyticsRepository) RouteStats(ctx context.Context, start, end time.Time) ([]model.RouteStat, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT route,
		        SUM(count)::int,
		        COALESCE(SUM(count) FILTER (WHERE status_class = '5xx'), 0)::int,
		        COALESCE(SUM(count) FILTER (WHERE status_class = '4xx'), 0)::int,
		        (SUM(p50_ms::bigint * count) / GREATEST(SUM(count), 1))::int,
		        MAX(p95_ms)::int
		   FROM analytics_request_stats
		  WHERE hour >= $1 AND hour < $2
		  GROUP BY route
		  ORDER BY SUM(count) DESC`,
		start, end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.RouteStat
	for rows.Next() {
		var s model.RouteStat
		if err := rows.Scan(&s.Route, &s.Count, &s.Errors5xx, &s.Errors4xx, &s.P50Ms, &s.P95Ms); err != nil {
			return nil, err
		}
		if s.Count > 0 {
			s.ErrorRate = float64(s.Errors5xx) / float64(s.Count)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
