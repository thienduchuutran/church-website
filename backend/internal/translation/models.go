// Package translation provides an async EN -> VI translation engine.
//
// Three pieces work together:
//   - Translator handles the per-field translate-and-store mechanics: cache
//     lookup by source hash, AI model selection, persistence into the
//     translations table.
//   - Worker is a background goroutine that drains translation_jobs in batches
//     using FOR UPDATE SKIP LOCKED so multiple backend instances can run safely.
//   - EnqueueTranslation is the fire-and-forget hook content handlers call from
//     inside a `go` statement after creating or updating a post.
//
// English content is saved instantly by the handler; the worker fills in
// translations asynchronously, so users never wait on a model call.
package translation

import "time"

// ContentType labels a job in translation_jobs.content_type. Every job is
// 'general' and every translation goes to Gemini - a planned 'pastoral' type
// (Claude routing for sermon-like content) was removed in 2026-07 because the
// site never translates sermons. The type survives as plain text so adding a
// real second type later does not require a schema migration.
type ContentType string

const (
	ContentTypeGeneral ContentType = "general"
)

// TranslationJob mirrors a row in translation_jobs. Fields is the {field_name
// -> source text} map the worker iterates over. TargetLocales is normally
// ["vi"] but is a slice so the same job can fan out to more locales later.
type TranslationJob struct {
	ID            string
	TableName     string
	RecordID      string
	Fields        map[string]string
	TargetLocales []string
	ContentType   ContentType
	Status        string
	Attempts      int
}

// Translation mirrors a row in translations. ApprovedBy / ApprovedAt are
// nullable because AI translations start unapproved; a bilingual admin sets
// them via the review panel (Phase 5).
type Translation struct {
	ID             string
	TableName      string
	RecordID       string
	FieldName      string
	Locale         string
	SourceHash     string
	SourceText     string
	TranslatedText string
	IsAIGenerated  bool
	ApprovedBy     *string
	ApprovedAt     *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
