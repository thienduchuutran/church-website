package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/service"
)

type CalendarHandler struct {
	svc *service.CalendarService
}

func NewCalendarHandler(svc *service.CalendarService) *CalendarHandler {
	return &CalendarHandler{svc: svc}
}

// GetMonth handles GET /api/v1/calendar?year=2026&month=4
func (h *CalendarHandler) GetMonth(w http.ResponseWriter, r *http.Request) {
	year, month, ok := parseYearMonth(w, r)
	if !ok {
		return
	}
	resp, err := h.svc.GetMonth(r.Context(), year, month)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load calendar")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// CreateEvent handles POST /api/v1/calendar/events (admin only).
func (h *CalendarHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var req model.CreateCalendarEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := middleware.UserIDFromContext(r.Context())
	e, err := h.svc.CreateEvent(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

// UpdateEvent handles PATCH /api/v1/calendar/events/{id} (admin only).
func (h *CalendarHandler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateCalendarEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	e, err := h.svc.UpdateEvent(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

// DeleteEvent handles DELETE /api/v1/calendar/events/{id} (admin only).
func (h *CalendarHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteEvent(r.Context(), id); err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete event")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpsertMonthNote handles PUT /api/v1/calendar/months/{year}/{month}/note (admin only).
func (h *CalendarHandler) UpsertMonthNote(w http.ResponseWriter, r *http.Request) {
	yearStr := chi.URLParam(r, "year")
	monthStr := chi.URLParam(r, "month")
	year, err1 := strconv.Atoi(yearStr)
	month, err2 := strconv.Atoi(monthStr)
	if err1 != nil || err2 != nil || month < 1 || month > 12 {
		writeError(w, http.StatusBadRequest, "invalid year or month")
		return
	}
	var req model.UpsertMonthNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := middleware.UserIDFromContext(r.Context())
	note, err := h.svc.UpsertMonthNote(r.Context(), year, month, req, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save month note")
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func parseYearMonth(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	q := r.URL.Query()
	yearStr := q.Get("year")
	monthStr := q.Get("month")
	if yearStr == "" || monthStr == "" {
		writeError(w, http.StatusBadRequest, "year and month query params are required")
		return 0, 0, false
	}
	year, err1 := strconv.Atoi(yearStr)
	month, err2 := strconv.Atoi(monthStr)
	if err1 != nil || err2 != nil || month < 1 || month > 12 {
		writeError(w, http.StatusBadRequest, "invalid year or month")
		return 0, 0, false
	}
	return year, month, true
}
