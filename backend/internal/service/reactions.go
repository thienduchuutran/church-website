package service

import (
	"context"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// ReactionService orchestrates reaction persistence.
// Fingerprint abuse prevention (rate-limit, IP checks) should be added here, not in the handler.
type ReactionService struct {
	repo *repository.ReactionRepository
}

func NewReactionService(repo *repository.ReactionRepository) *ReactionService {
	return &ReactionService{repo: repo}
}

// UpsertReaction saves a reaction, replacing the previous one for the same fingerprint+post.
func (s *ReactionService) UpsertReaction(ctx context.Context, postID, emoji, fingerprint string) error {
	return s.repo.UpsertReaction(ctx, postID, emoji, fingerprint)
}

// DeleteReaction removes a reaction identified by (postID, fingerprint).
func (s *ReactionService) DeleteReaction(ctx context.Context, postID, fingerprint string) error {
	return s.repo.DeleteReaction(ctx, postID, fingerprint)
}

// GetCounts returns per-emoji reaction counts for a post.
func (s *ReactionService) GetCounts(ctx context.Context, postID string) ([]model.ReactionCount, error) {
	return s.repo.GetReactionCounts(ctx, postID)
}
