package service

import (
	"context"
	"log"

	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/translation"
)

// PageService orchestrates page content operations.
type PageService struct {
	repo    *repository.PageRepository
	enqueue translation.EnqueueFn // optional - nil-safe; when nil, no translation jobs fire
}

func NewPageService(repo *repository.PageRepository) *PageService {
	return &PageService{repo: repo}
}

// SetTranslationQueue wires the async translation enqueuer. Same pattern as
// PostService: opt-in so a fresh dev environment without AI keys still serves
// pages normally - translation just doesn't fan out.
func (s *PageService) SetTranslationQueue(enqueue translation.EnqueueFn) {
	s.enqueue = enqueue
}

// GetPageContent returns all section key-value pairs for a page, COALESCE'd
// against the requested locale. machineTranslated is true when at least one
// returned section came from an unapproved AI translation.
func (s *PageService) GetPageContent(ctx context.Context, slug, locale string) (map[string]string, bool, error) {
	return s.repo.GetSections(ctx, slug, locale)
}

// UpdatePageContent upserts section values for a page and enqueues translation
// for any section whose content changed.
//
// Flow:
//   1. Pre-fetch existing detail rows so we know which section_keys are new
//      and what content they had before the patch.
//   2. Upsert the new content. This is the user's primary action - it must
//      not be blocked by translation bookkeeping.
//   3. Post-fetch detail so newly-inserted rows have IDs we can use as
//      record_id in translation_jobs.
//   4. Diff: enqueue per-section only when content actually changed. Skipped
//      sections do not produce translation jobs, keeping worker logs quiet.
func (s *PageService) UpdatePageContent(ctx context.Context, slug string, sections map[string]string) error {
	existingByKey := map[string]string{}
	if existing, err := s.repo.GetSectionsDetail(ctx, slug); err != nil {
		// Pre-fetch is best-effort - we still upsert below; the diff just degrades
		// to "enqueue all" since we cannot tell what changed.
		log.Printf("page translation pre-fetch failed (slug=%s): %v", slug, err)
	} else {
		for _, pc := range existing {
			existingByKey[pc.SectionKey] = pc.Content
		}
	}

	if err := s.repo.UpsertSections(ctx, slug, sections); err != nil {
		return err
	}

	if s.enqueue == nil {
		return nil
	}

	updated, err := s.repo.GetSectionsDetail(ctx, slug)
	if err != nil {
		log.Printf("page translation post-fetch failed (slug=%s): %v", slug, err)
		return nil
	}
	for _, pc := range updated {
		newContent, sentInPatch := sections[pc.SectionKey]
		if !sentInPatch {
			continue
		}
		if existingByKey[pc.SectionKey] == newContent {
			continue
		}
		s.enqueueSection(pc.ID, newContent)
	}
	return nil
}

func (s *PageService) enqueueSection(recordID, content string) {
	if s.enqueue == nil || content == "" {
		return
	}
	s.enqueue(translation.TranslationJob{
		TableName:     "page_content",
		RecordID:      recordID,
		Fields:        map[string]string{"content": content},
		TargetLocales: []string{"vi"},
		ContentType:   translation.ContentTypeGeneral,
	})
}

