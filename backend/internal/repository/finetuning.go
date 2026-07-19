package repository

import (
	"context"
	"fmt"
)

// FinetuningExample is a gold (English source, approved Vietnamese) training
// pair captured at the moment a bilingual admin approves a translation. It
// mirrors a row in fine_tuning_examples; the accumulated rows become the
// dataset for a future LoRA fine-tune (see docs/FINE_TUNING_PLAN.md).
type FinetuningExample struct {
	SourceEN    string // the English text the AI translated from
	ApprovedVI  string // the Vietnamese text as finalized by the human reviewer
	ContentType string // always 'general' today - mirrors translation.ContentType
	SourceField string // 'title', 'body', 'content', 'notes', ...
	RecordTable string // 'posts', 'page_content', 'calendar_events', ...
	RecordID    string
	ApprovedBy  string // JWT sub of the approving admin
}

// CaptureFinetuningExample inserts a gold (source_en, approved_vi) pair for
// future fine-tuning. Uses ON CONFLICT DO NOTHING against the unique
// (record_id, source_field, record_table) index - if the same pair was
// already captured, the call is a silent no-op. Idempotent by design: the
// service fires this on every approval, and approving twice must not error.
func (r *TranslationRepository) CaptureFinetuningExample(ctx context.Context, ex FinetuningExample) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO fine_tuning_examples
		   (source_en, approved_vi, content_type, source_field, record_table, record_id, approved_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (record_id, source_field, record_table) DO NOTHING`,
		ex.SourceEN, ex.ApprovedVI, ex.ContentType, ex.SourceField,
		ex.RecordTable, ex.RecordID, ex.ApprovedBy,
	)
	if err != nil {
		return fmt.Errorf("capture fine-tuning example: %w", err)
	}
	return nil
}
