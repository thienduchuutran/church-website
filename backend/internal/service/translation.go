package service

import (
	"context"
	"fmt"

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
	return t, nil
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
