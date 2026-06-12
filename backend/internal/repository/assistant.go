package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// AssistantRepository retrieves church content for RAG context building.
// It searches posts, calendar events, and page content using keyword matching.
type AssistantRepository struct {
	pool *pgxpool.Pool
}

// NewAssistantRepository creates a new AssistantRepository backed by the given pool.
func NewAssistantRepository(pool *pgxpool.Pool) *AssistantRepository {
	return &AssistantRepository{pool: pool}
}

// SearchPosts finds posts whose title or body match any of the given keywords.
// Results are ordered by creation date descending (newest first) and capped at limit.
func (r *AssistantRepository) SearchPosts(ctx context.Context, keywords []string, limit int) ([]model.AssistantSource, []string, error) {
	if len(keywords) == 0 || limit <= 0 {
		return nil, nil, nil
	}

	// Build ILIKE conditions for each keyword against title and body.
	conditions := make([]string, 0, len(keywords))
	args := make([]interface{}, 0, len(keywords)*2)
	argIdx := 1
	for _, kw := range keywords {
		pattern := "%" + kw + "%"
		conditions = append(conditions, fmt.Sprintf("(LOWER(title) LIKE LOWER($%d) OR LOWER(COALESCE(body, '')) LIKE LOWER($%d))", argIdx, argIdx+1))
		args = append(args, pattern, pattern)
		argIdx += 2
	}

	query := fmt.Sprintf(`
		SELECT id, type, title, COALESCE(body, ''), event_date, created_at
		FROM posts
		WHERE %s
		ORDER BY created_at DESC
		LIMIT %d
	`, strings.Join(conditions, " OR "), limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("search posts: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, postType, title, body string
		var eventDate, createdAt interface{}
		if err := rows.Scan(&id, &postType, &title, &body, &eventDate, &createdAt); err != nil {
			return nil, nil, fmt.Errorf("scan post row: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "post",
			Title: title,
		})
		// Build a human-readable context snippet for the LLM.
		snippet := fmt.Sprintf("[%s] %s", strings.ToUpper(postType), title)
		if body != "" {
			// Truncate long bodies to keep the context window manageable.
			if len(body) > 500 {
				body = body[:500] + "..."
			}
			snippet += ": " + body
		}
		contextTexts = append(contextTexts, snippet)
	}
	return sources, contextTexts, rows.Err()
}

// SearchCalendarEvents finds calendar events whose title or notes match keywords.
// Returns events ordered by date ascending (soonest first).
func (r *AssistantRepository) SearchCalendarEvents(ctx context.Context, keywords []string, limit int) ([]model.AssistantSource, []string, error) {
	if len(keywords) == 0 || limit <= 0 {
		return nil, nil, nil
	}

	conditions := make([]string, 0, len(keywords))
	args := make([]interface{}, 0, len(keywords)*2)
	argIdx := 1
	for _, kw := range keywords {
		pattern := "%" + kw + "%"
		conditions = append(conditions, fmt.Sprintf("(LOWER(title) LIKE LOWER($%d) OR LOWER(COALESCE(notes, '')) LIKE LOWER($%d))", argIdx, argIdx+1))
		args = append(args, pattern, pattern)
		argIdx += 2
	}

	query := fmt.Sprintf(`
		SELECT id, date, title, event_type, COALESCE(notes, '')
		FROM calendar_events
		WHERE %s
		ORDER BY date ASC
		LIMIT %d
	`, strings.Join(conditions, " OR "), limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("search calendar events: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, title, eventType, notes string
		var date interface{}
		if err := rows.Scan(&id, &date, &title, &eventType, &notes); err != nil {
			return nil, nil, fmt.Errorf("scan calendar row: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "calendar_event",
			Title: title,
		})
		snippet := fmt.Sprintf("[CALENDAR %s] %s on %v", strings.ToUpper(eventType), title, date)
		if notes != "" {
			if len(notes) > 300 {
				notes = notes[:300] + "..."
			}
			snippet += " — " + notes
		}
		contextTexts = append(contextTexts, snippet)
	}
	return sources, contextTexts, rows.Err()
}

// SearchPageContent finds page content sections matching keywords.
// Returns context snippets from the about/connect pages.
func (r *AssistantRepository) SearchPageContent(ctx context.Context, keywords []string, limit int) ([]model.AssistantSource, []string, error) {
	if len(keywords) == 0 || limit <= 0 {
		return nil, nil, nil
	}

	conditions := make([]string, 0, len(keywords))
	args := make([]interface{}, 0, len(keywords))
	argIdx := 1
	for _, kw := range keywords {
		pattern := "%" + kw + "%"
		conditions = append(conditions, fmt.Sprintf("LOWER(content) LIKE LOWER($%d)", argIdx))
		args = append(args, pattern)
		argIdx++
	}

	query := fmt.Sprintf(`
		SELECT id, page_slug, section_key, content
		FROM page_content
		WHERE %s
		ORDER BY page_slug, section_key
		LIMIT %d
	`, strings.Join(conditions, " OR "), limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("search page content: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, pageSlug, sectionKey, content string
		if err := rows.Scan(&id, &pageSlug, &sectionKey, &content); err != nil {
			return nil, nil, fmt.Errorf("scan page content row: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "page",
			Title: fmt.Sprintf("%s — %s", pageSlug, sectionKey),
		})
		if len(content) > 400 {
			content = content[:400] + "..."
		}
		contextTexts = append(contextTexts, fmt.Sprintf("[PAGE %s/%s] %s", pageSlug, sectionKey, content))
	}
	return sources, contextTexts, rows.Err()
}

// GetUpcomingEvents returns the next N events from the posts table, regardless of
// keyword match. Used to provide general context when the user asks about upcoming events.
func (r *AssistantRepository) GetUpcomingEvents(ctx context.Context, limit int) ([]model.AssistantSource, []string, error) {
	query := `
		SELECT id, title, COALESCE(body, ''), event_date
		FROM posts
		WHERE type = 'event' AND event_date >= NOW()
		ORDER BY event_date ASC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("get upcoming events: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, title, body string
		var eventDate interface{}
		if err := rows.Scan(&id, &title, &body, &eventDate); err != nil {
			return nil, nil, fmt.Errorf("scan upcoming event: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "post",
			Title: title,
		})
		snippet := fmt.Sprintf("[UPCOMING EVENT] %s", title)
		if body != "" {
			if len(body) > 300 {
				body = body[:300] + "..."
			}
			snippet += ": " + body
		}
		contextTexts = append(contextTexts, snippet)
	}
	return sources, contextTexts, rows.Err()
}

// GetUpcomingCalendarEvents returns the next N events from the calendar_events table,
// regardless of keyword match. Used to provide general calendar context.
func (r *AssistantRepository) GetUpcomingCalendarEvents(ctx context.Context, limit int) ([]model.AssistantSource, []string, error) {
	query := `
		SELECT id, date, title, event_type, COALESCE(notes, '')
		FROM calendar_events
		WHERE date >= CURRENT_DATE
		ORDER BY date ASC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("get upcoming calendar events: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, title, eventType, notes string
		var date interface{}
		if err := rows.Scan(&id, &date, &title, &eventType, &notes); err != nil {
			return nil, nil, fmt.Errorf("scan upcoming calendar event: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "calendar_event",
			Title: title,
		})
		snippet := fmt.Sprintf("[UPCOMING CALENDAR %s] %s on %v", strings.ToUpper(eventType), title, date)
		if notes != "" {
			if len(notes) > 300 {
				notes = notes[:300] + "..."
			}
			snippet += " — " + notes
		}
		contextTexts = append(contextTexts, snippet)
	}
	return sources, contextTexts, rows.Err()
}

// GetRecentAnnouncements returns the latest N announcements, regardless of keyword match.
// Used to provide general context about what's happening at the church.
func (r *AssistantRepository) GetRecentAnnouncements(ctx context.Context, limit int) ([]model.AssistantSource, []string, error) {
	query := `
		SELECT id, title, COALESCE(body, ''), created_at
		FROM posts
		WHERE type = 'announcement'
		ORDER BY created_at DESC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("get recent announcements: %w", err)
	}
	defer rows.Close()

	var sources []model.AssistantSource
	var contextTexts []string
	for rows.Next() {
		var id, title, body string
		var createdAt interface{}
		if err := rows.Scan(&id, &title, &body, &createdAt); err != nil {
			return nil, nil, fmt.Errorf("scan announcement: %w", err)
		}
		sources = append(sources, model.AssistantSource{
			ID:    id,
			Type:  "post",
			Title: title,
		})
		snippet := fmt.Sprintf("[ANNOUNCEMENT] %s", title)
		if body != "" {
			if len(body) > 300 {
				body = body[:300] + "..."
			}
			snippet += ": " + body
		}
		contextTexts = append(contextTexts, snippet)
	}
	return sources, contextTexts, rows.Err()
}
