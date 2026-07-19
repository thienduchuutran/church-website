package service

import (
	"context"
	"fmt"
	"log"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/translation"
)

// TranslationService backs the admin /admin/translations review panel.
// It is intentionally narrow - the public read path joins translations
// inside posts.go / calendar.go / pages.go; this service is purely the
// reviewer-facing surface (list, approve, retranslate).
type TranslationService struct {
	repo    *repository.TranslationRepository
	enqueue translation.EnqueueFn // optional - retranslate falls back to delete-only when nil
}

func NewTranslationService(repo *repository.TranslationRepository) *TranslationService {
	return &TranslationService{repo: repo}
}

// SetTranslationQueue wires the same enqueue closure the content services
// use. Same opt-in pattern: when no AI key is configured the worker stays
// disabled, but admins can still approve existing translations - retranslate
// is the only action that needs the queue.
func (s *TranslationService) SetTranslationQueue(enqueue translation.EnqueueFn) {
	s.enqueue = enqueue
}

// List returns translations matching the filters. The frontend passes
// approved=false (default) for the "Needs Review" tab, approved=true for
// "Approved", and omits it for "All".
func (s *TranslationService) List(ctx context.Context, f repository.TranslationListFilters) (*model.TranslationListResponse, error) {
	items, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, fmt.Errorf("list translations: %w", err)
	}
	if items == nil {
		items = []model.TranslationListItem{}
	}
	return &model.TranslationListResponse{Items: items, Total: total}, nil
}

// Approve marks a translation as human-reviewed. translatedText is the
// edited text from the reviewer's textarea; pass nil to approve the existing
// AI text as-is.
func (s *TranslationService) Approve(ctx context.Context, id, approverID string, translatedText *string) (*model.Translation, error) {
	t, err := s.repo.Approve(ctx, id, approverID, translatedText)
	if err != nil {
		return nil, fmt.Errorf("approve translation: %w", err)
	}
	s.captureFinetuningExample(t)
	return t, nil
}

// captureFinetuningExample records the approved (English source, Vietnamese
// final) pair into fine_tuning_examples - the training dataset for a future
// fine-tuned model (docs/FINE_TUNING_PLAN.md). Both approve-as-is and
// edit+approve land here because both flow through Approve; the edited case
// is the most valuable pair (the human's preferred wording).
//
// Fire-and-forget with context.Background(), same pattern as the translation
// enqueue: approval is mandatory, capture is best-effort. A capture failure
// is logged and never surfaced to the admin. Re-approving the same row is a
// silent no-op via ON CONFLICT in the repository.
func (s *TranslationService) captureFinetuningExample(t *model.Translation) {
	if t == nil || t.ApprovedBy == nil {
		return
	}
	ex := repository.FinetuningExample{
		SourceEN:   t.SourceText,
		ApprovedVI: t.TranslatedText,
		// 'general' is the engine's only content type - everything routes to
		// Gemini (Retranslate below re-enqueues with ContentTypeGeneral too).
		ContentType: string(translation.ContentTypeGeneral),
		SourceField: t.FieldName,
		RecordTable: t.TableName,
		RecordID:    t.RecordID,
		ApprovedBy:  *t.ApprovedBy,
	}
	go func() {
		if err := s.repo.CaptureFinetuningExample(context.Background(), ex); err != nil {
			log.Printf("fine-tuning capture for translation %s: %v", t.ID, err)
		}
	}()
}

// CleanupOrphans sweeps translations (and pending queue jobs) whose parent
// record has been deleted. Translations deliberately have no FK to their
// parents, so content deletes leave rows behind that clutter the review panel
// with "posts:a1b2c3d4"-style labels. Order matters: jobs first, then
// translations - sweeping jobs last would leave a window where a just-claimed
// job re-creates an orphan translation that this sweep already deleted.
// Returns both counts so the admin panel can report what was removed.
func (s *TranslationService) CleanupOrphans(ctx context.Context) (int, int, error) {
	jobs, err := s.repo.DeleteOrphanedPendingJobs(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("cleanup orphans: %w", err)
	}
	translations, err := s.repo.DeleteOrphanedTranslations(ctx)
	if err != nil {
		return 0, jobs, fmt.Errorf("cleanup orphans: %w", err)
	}
	return translations, jobs, nil
}

// RetranslateAll is the bulk version of Retranslate. It is meant to be run
// after `scripts/sync-prompt.sh` pushes a new system prompt: all unapproved
// translations get deleted and re-queued so the worker produces fresh output
// with the new prompt. Approved translations are left untouched - the
// reviewer's edits are treated as sacred and never auto-clobbered.
//
// Returns the number of rows re-queued. When no AI key is configured (enqueue
// is nil), the rows are still deleted but no jobs are queued - the worker
// would never drain them anyway. The next content edit will eventually
// re-trigger translation through the normal content-service path.
func (s *TranslationService) RetranslateAll(ctx context.Context) (int, error) {
	deleted, err := s.repo.DeleteUnapproved(ctx)
	if err != nil {
		return 0, fmt.Errorf("retranslate all: %w", err)
	}
	if s.enqueue == nil {
		return 0, nil
	}
	for _, t := range deleted {
		s.enqueue(translation.TranslationJob{
			TableName:     t.TableName,
			RecordID:      t.RecordID,
			Fields:        map[string]string{t.FieldName: t.SourceText},
			TargetLocales: []string{t.Locale},
			ContentType:   translation.ContentTypeGeneral,
		})
	}
	return len(deleted), nil
}

// Retranslate is the "I edited the system prompt, give me a fresh translation"
// path. The current row is deleted (so public reads fall back to English via
// COALESCE) and a new translation_jobs row is enqueued. The worker then
// produces a new translation with whatever system prompt is current in
// `system_prompts` - this is how prompt iterations propagate.
//
// Returns the (now-deleted) source metadata so the frontend can show "queued
// for retranslation" feedback without a second fetch.
func (s *TranslationService) Retranslate(ctx context.Context, id string) (*model.Translation, error) {
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("fetch translation: %w", err)
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		return nil, fmt.Errorf("delete translation: %w", err)
	}
	if s.enqueue != nil {
		s.enqueue(translation.TranslationJob{
			TableName:     existing.TableName,
			RecordID:      existing.RecordID,
			Fields:        map[string]string{existing.FieldName: existing.SourceText},
			TargetLocales: []string{existing.Locale},
			ContentType:   translation.ContentTypeGeneral,
		})
	}
	return existing, nil
}
