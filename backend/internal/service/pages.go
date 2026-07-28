package service

import (
	"context"
	"log"

	"github.com/thienduchuutran/church-website/backend/internal/model"
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

// GetPageBlocks returns the ordered block list for a page, with locale-aware
// title and content. This is the block-model counterpart to GetPageContent;
// both are called on GET /pages/:slug so the response contains both projections.
func (s *PageService) GetPageBlocks(ctx context.Context, slug, locale string) ([]model.PageBlock, bool, error) {
	return s.repo.GetBlocks(ctx, slug, locale)
}

// ReplacePageBlocks performs a full block replace for a page. It follows the
// same pre-fetch/diff/enqueue pattern as UpdatePageContent, but enqueues both
// title and content fields per changed block. Blocks that did not change
// produce no translation jobs.
func (s *PageService) ReplacePageBlocks(ctx context.Context, slug string, blocks []model.PageBlock) error {
	// Pre-fetch existing blocks so we can diff after the replace.
	existingByID := map[string]model.PageBlock{}
	if existing, _, err := s.repo.GetBlocks(ctx, slug, ""); err != nil {
		log.Printf("page blocks pre-fetch failed (slug=%s): %v", slug, err)
	} else {
		for _, b := range existing {
			existingByID[b.ID] = b
		}
	}

	if err := s.repo.ReplaceBlocks(ctx, slug, blocks); err != nil {
		return err
	}

	if s.enqueue == nil {
		return nil
	}

	// Post-fetch to get IDs of newly inserted blocks.
	updated, _, err := s.repo.GetBlocks(ctx, slug, "")
	if err != nil {
		log.Printf("page blocks post-fetch failed (slug=%s): %v", slug, err)
		return nil
	}

	// Enqueue translation jobs for blocks whose title or content changed.
	for _, b := range updated {
		fields := map[string]string{}
		old, existed := existingByID[b.ID]
		if !existed {
			// New block - enqueue both fields if non-empty.
			if b.Title != "" {
				fields["title"] = b.Title
			}
			if b.Content != "" {
				fields["content"] = b.Content
			}
		} else {
			// Existing block - diff each field.
			if b.Title != old.Title && b.Title != "" {
				fields["title"] = b.Title
			}
			if b.Content != old.Content && b.Content != "" {
				fields["content"] = b.Content
			}
		}
		if len(fields) == 0 {
			continue
		}
		s.enqueue(translation.TranslationJob{
			TableName:     "page_content",
			RecordID:      b.ID,
			Fields:        fields,
			TargetLocales: []string{"vi"},
			ContentType:   translation.ContentTypeGeneral,
		})
	}
	return nil
}


