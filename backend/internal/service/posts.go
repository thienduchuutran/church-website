package service

import (
	"context"
	"fmt"
	"log"

	"github.com/thienduchuutran/church-website/backend/internal/discord"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

type PostService struct {
	posts *repository.PostRepository
}

func NewPostService(posts *repository.PostRepository) *PostService {
	return &PostService{posts: posts}
}

// Create validates the request, persists the post, and fires a Discord notification.
func (s *PostService) Create(ctx context.Context, req model.CreatePostRequest, userID string) (*model.Post, error) {
	if err := req.Validate(); err != nil {
		return nil, fmt.Errorf("validation: %w", err)
	}

	post := &model.Post{
		Type:         req.Type,
		Title:        req.Title,
		Body:         req.Body,
		EventDate:    req.EventDate,
		ExternalLink: req.ExternalLink,
		AdminID:      &userID,
	}

	if err := s.posts.InsertPost(ctx, post); err != nil {
		return nil, fmt.Errorf("insert: %w", err)
	}

	go func() {
		if err := discord.SendToDiscord(*post); err != nil {
			log.Printf("discord webhook error for post %s: %v", post.ID, err)
		}
	}()

	return post, nil
}

func (s *PostService) List(ctx context.Context, postType *model.PostType, limit, offset int) ([]model.Post, error) {
	return s.posts.GetPosts(ctx, postType, limit, offset)
}

func (s *PostService) Get(ctx context.Context, id string) (*model.Post, error) {
	return s.posts.GetPostByID(ctx, id)
}

func (s *PostService) Update(ctx context.Context, id string, req model.UpdatePostRequest) (*model.Post, error) {
	return s.posts.UpdatePost(ctx, id, req)
}

func (s *PostService) Delete(ctx context.Context, id string) error {
	return s.posts.DeletePost(ctx, id)
}
