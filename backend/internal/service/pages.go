package service

import (
	"context"

	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// PageService orchestrates page content operations.
type PageService struct {
	repo *repository.PageRepository
}

func NewPageService(repo *repository.PageRepository) *PageService {
	return &PageService{repo: repo}
}

// GetPageContent returns all section key-value pairs for a page.
func (s *PageService) GetPageContent(ctx context.Context, slug string) (map[string]string, error) {
	return s.repo.GetSections(ctx, slug)
}

// UpdatePageContent upserts section values for a page.
func (s *PageService) UpdatePageContent(ctx context.Context, slug string, sections map[string]string) error {
	return s.repo.UpsertSections(ctx, slug, sections)
}
