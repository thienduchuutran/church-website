package service

import (
	"context"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// TagService handles tag business logic.
type TagService struct {
	repo *repository.TagRepository
}

// NewTagService creates a new tag service.
func NewTagService(repo *repository.TagRepository) *TagService {
	return &TagService{repo: repo}
}

// GetAll returns all tags ordered by name.
func (s *TagService) GetAll(ctx context.Context) ([]model.Tag, error) {
	return s.repo.GetAllTags(ctx)
}

// Create validates and creates a new tag. Returns ErrAlreadyExists if the name
// is already taken.
func (s *TagService) Create(ctx context.Context, name, userID string) (*model.Tag, error) {
	if err := (&model.CreateTagRequest{Name: name}).Validate(); err != nil {
		return nil, err
	}
	return s.repo.CreateTag(ctx, name, userID)
}

// Replace deletes all existing tags for a post and inserts the new ones.
func (s *TagService) Replace(ctx context.Context, postID string, tagIDs []string) error {
	return s.repo.ReplacePostTags(ctx, postID, tagIDs)
}

// RemoveTag deletes a single tag from a post.
func (s *TagService) RemoveTag(ctx context.Context, postID, tagID string) error {
	return s.repo.RemovePostTag(ctx, postID, tagID)
}
