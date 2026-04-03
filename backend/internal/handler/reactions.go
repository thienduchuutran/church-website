package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// reactionService is the interface the handler depends on.
// Keeping it an interface (not the concrete *service.ReactionService) lets us swap in
// the mockReactionService in tests without a real database.
type reactionService interface {
	UpsertReaction(ctx context.Context, postID, emoji, fingerprint string) error
	DeleteReaction(ctx context.Context, postID, fingerprint string) error
	GetCounts(ctx context.Context, postID string) ([]model.ReactionCount, error)
	// GetMyReaction returns the emoji for the given fingerprint on a post, or nil if none.
	GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error)
}

// allowedEmojis mirrors the CHECK constraint on the reactions table.
var allowedEmojis = map[string]bool{
	"👍": true,
	"❤️": true,
	"🙏": true,
	"😂": true,
}

// ReactionHandler handles public reaction endpoints (no auth required).
type ReactionHandler struct {
	svc reactionService
}

func NewReactionHandler(svc reactionService) *ReactionHandler {
	return &ReactionHandler{svc: svc}
}

type upsertReactionRequest struct {
	PostID      string `json:"post_id"`
	Emoji       string `json:"emoji"`
	Fingerprint string `json:"fingerprint"`
}

type deleteReactionRequest struct {
	Fingerprint string `json:"fingerprint"`
}

// Upsert handles POST /api/v1/reactions — adds or changes a viewer's reaction.
func (h *ReactionHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	var req upsertReactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PostID == "" || req.Emoji == "" || req.Fingerprint == "" {
		writeError(w, http.StatusBadRequest, "post_id, emoji, and fingerprint are required")
		return
	}
	if !allowedEmojis[req.Emoji] {
		writeError(w, http.StatusBadRequest, "emoji must be one of 👍 ❤️ 🙏 😂")
		return
	}
	if err := h.svc.UpsertReaction(r.Context(), req.PostID, req.Emoji, req.Fingerprint); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save reaction")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/reactions/{post_id} — removes a viewer's reaction.
func (h *ReactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	postID := chi.URLParam(r, "post_id")
	var req deleteReactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if postID == "" || req.Fingerprint == "" {
		writeError(w, http.StatusBadRequest, "post_id and fingerprint are required")
		return
	}
	if err := h.svc.DeleteReaction(r.Context(), postID, req.Fingerprint); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete reaction")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetCounts handles GET /api/v1/reactions/{post_id}[?fingerprint=<fp>].
// Returns per-emoji counts and, when a fingerprint is provided, the caller's own reaction.
// No auth required — fingerprint is the anonymous identity.
func (h *ReactionHandler) GetCounts(w http.ResponseWriter, r *http.Request) {
	postID := chi.URLParam(r, "post_id")
	if postID == "" {
		writeError(w, http.StatusBadRequest, "post_id is required")
		return
	}

	counts, err := h.svc.GetCounts(r.Context(), postID)
	if err != nil {
		log.Printf("GetCounts error for post %s: %v", postID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch reactions")
		return
	}
	// Return [] not null so the frontend can iterate without a nil check.
	if counts == nil {
		counts = []model.ReactionCount{}
	}

	summary := model.ReactionSummary{Counts: counts}

	// Only look up the caller's reaction when they supply their fingerprint.
	if fp := r.URL.Query().Get("fingerprint"); fp != "" {
		myReaction, err := h.svc.GetMyReaction(r.Context(), postID, fp)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch your reaction")
			return
		}
		summary.MyReaction = myReaction
	}

	writeJSON(w, http.StatusOK, summary)
}
