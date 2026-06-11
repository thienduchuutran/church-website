package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// adminTranslationService is the slice of TranslationService the handler
// depends on. Defined as an interface so tests can mock without spinning up
// a DB - same pattern as ReactionHandler / PageHandler.
type adminTranslationService interface {
	List(ctx context.Context, f repository.TranslationListFilters) (*model.TranslationListResponse, error)
	Approve(ctx context.Context, id, approverID string, translatedText *string) (*model.Translation, error)
	Retranslate(ctx context.Context, id string) (*model.Translation, error)
	RetranslateAll(ctx context.Context) (int, error)
}

type AdminTranslationsHandler struct {
	svc adminTranslationService
}

func NewAdminTranslationsHandler(svc adminTranslationService) *AdminTranslationsHandler {
	return &AdminTranslationsHandler{svc: svc}
}

// List handles GET /api/v1/admin/translations.
//
// Query params:
//   locale=vi             default: empty (all locales)
//   approved=false|true   default: false (pending review) - omit param to get all
//   limit=20              default: 20, cap: 100
//   offset=0              default: 0
func (h *AdminTranslationsHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filters := repository.TranslationListFilters{
		Locale: q.Get("locale"),
		Limit:  20,
		Offset: 0,
	}

	// approved is tri-state: parameter present means "filter by this value",
	// parameter absent means "all". We default the filter UI to "needs
	// review" (approved=false) but expose "All" by simply omitting the param.
	if v := q.Get("approved"); v != "" {
		approved := v == "true"
		filters.Approved = &approved
	}

	if v := q.Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			filters.Limit = parsed
		}
	}
	if filters.Limit > 100 {
		filters.Limit = 100
	}
	if v := q.Get("offset"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
			filters.Offset = parsed
		}
	}

	resp, err := h.svc.List(r.Context(), filters)
	if err != nil {
		log.Printf("admin translations list: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load translations")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// Approve handles PATCH /api/v1/admin/translations/{id}.
// Body { translated_text?: string }. Omit translated_text to approve as-is.
func (h *AdminTranslationsHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	var req model.ApproveTranslationRequest
	// Decode is tolerant of empty body - some clients PATCH with no body to
	// signal "approve as-is." json.Decode returns io.EOF on empty input; we
	// treat that as a zero-value req (translated_text=nil).
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	approverID := middleware.UserIDFromContext(r.Context())
	if approverID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	updated, err := h.svc.Approve(r.Context(), id, approverID, req.TranslatedText)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "translation not found")
			return
		}
		log.Printf("approve translation %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to approve translation")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// Retranslate handles POST /api/v1/admin/translations/retranslate/{id}.
// Deletes the existing translation row and re-enqueues the job so the worker
// produces a fresh translation with whatever system prompt is current.
func (h *AdminTranslationsHandler) Retranslate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	deleted, err := h.svc.Retranslate(r.Context(), id)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "translation not found")
			return
		}
		log.Printf("retranslate %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to retranslate")
		return
	}
	// 202 Accepted: the operation is queued, the new translated_text won't
	// exist until the worker drains the job. Returning the source row gives
	// the frontend enough context to update its UI state immediately.
	writeJSON(w, http.StatusAccepted, deleted)
}

// RetranslateAll handles POST /api/v1/admin/translations/retranslate-all.
// Bulk version of Retranslate: every unapproved row is deleted and re-queued.
// Approved rows (human-reviewed) are left untouched. The natural use case is
// "I just ran sync-prompt.sh to ship a new prompt - rebuild every pending
// translation against it."
func (h *AdminTranslationsHandler) RetranslateAll(w http.ResponseWriter, r *http.Request) {
	count, err := h.svc.RetranslateAll(r.Context())
	if err != nil {
		log.Printf("retranslate-all: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to retranslate all")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]int{"requeued": count})
}
