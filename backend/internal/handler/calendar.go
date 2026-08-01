package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

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

// GetMonth handles GET /api/v1/calendar?year=2026&month=4&locale=vi
func (h *CalendarHandler) GetMonth(w http.ResponseWriter, r *http.Request) {
	year, month, ok := parseYearMonth(w, r)
	if !ok {
		return
	}
	// An absent ?locale= means English, not "raw". Before migration 000013 the two
	// were the same thing - the source column WAS English - so the frontend omits
	// the param for English viewers as a small optimization. Now they differ: the
	// raw path skips translation entirely, which would serve a Vietnamese-authored
	// event untranslated to an English reader. Defaulting here rather than
	// requiring the client to send it keeps old clients and direct API calls
	// correct, and leaves the raw path reachable only from internal service calls
	// that genuinely want stored text.
	locale := strings.TrimSpace(r.URL.Query().Get("locale"))
	if locale == "" {
		locale = "en"
	}
	resp, err := h.svc.GetMonth(r.Context(), year, month, locale)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load calendar")
		return
	}
	// Admin-only fields, all stripped in one place so there is a single boundary
	// to audit:
	//   - private_address: non-admins only see an address explicitly marked
	//     public on the site.
	//   - place / place_id: the venue that address resolved to. Stripped under
	//     the SAME condition, because a place name identifies a household as
	//     precisely as its street number - leaving "MST House" behind while
	//     hiding "203 Essex Street" would defeat the whole point of the flag.
	//   - title_source / notes_source / content_source: the untranslated English
	//     text, needed only so the admin edit form saves the source instead of
	//     the machine translation it is displaying. A public visitor has no use
	//     for it, and shipping it would double the text in every payload.
	if middleware.AdminEmailFromContext(r.Context()) == "" {
		for i := range resp.Events {
			if !resp.Events[i].AddressPublic {
				resp.Events[i].PrivateAddress = nil
				resp.Events[i].Place = nil
				resp.Events[i].PlaceID = nil
			}
			resp.Events[i].TitleSource = nil
			resp.Events[i].NotesSource = nil
		}
		if resp.MonthNote != nil {
			resp.MonthNote.ContentSource = nil
		}
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

// ListPlaces handles GET /api/v1/calendar/places (admin only).
//
// Unlike /calendar/event-types and /calendar/palette - deliberately public
// lists of labels and hex codes - this one returns addresses, including every
// address never marked address_public. It must stay inside the RequireAdmin
// group; see the route comments in cmd/server/main.go.
func (h *CalendarHandler) ListPlaces(w http.ResponseWriter, r *http.Request) {
	places, err := h.svc.ListPlaces(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load places")
		return
	}
	writeJSON(w, http.StatusOK, places)
}

// RenamePlace handles PATCH /api/v1/calendar/places/{id} (admin only).
//
// Renaming pins the label against the naming model, so this is how a wrong
// model answer gets corrected - and one call fixes every event at the address.
func (h *CalendarHandler) RenamePlace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateCalendarPlaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p, err := h.svc.RenamePlace(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "place not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// ListEventTypes handles GET /api/v1/calendar/event-types.
// Public, like GET /calendar: the category vocabulary is not sensitive, and the
// day modal needs the labels to render an event's category to visitors.
func (h *CalendarHandler) ListEventTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.svc.ListEventTypes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load event types")
		return
	}
	writeJSON(w, http.StatusOK, types)
}

// CreateEventType handles POST /api/v1/calendar/event-types (admin only).
// Behaves as get-or-create, so an admin who re-types an existing label gets
// that type back with 200 rather than a duplicate error.
func (h *CalendarHandler) CreateEventType(w http.ResponseWriter, r *http.Request) {
	var req model.CreateEventTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := middleware.UserIDFromContext(r.Context())
	t, err := h.svc.CreateEventType(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// ListPaletteColors handles GET /api/v1/calendar/palette.
// Public for the same reason as the event types - it is a list of hex strings,
// and keeping it ungated means the picker has one less auth path to get wrong.
func (h *CalendarHandler) ListPaletteColors(w http.ResponseWriter, r *http.Request) {
	colors, err := h.svc.ListPaletteColors(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load palette")
		return
	}
	writeJSON(w, http.StatusOK, colors)
}

// CreatePaletteColor handles POST /api/v1/calendar/palette (admin only).
func (h *CalendarHandler) CreatePaletteColor(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePaletteColorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := middleware.UserIDFromContext(r.Context())
	c, err := h.svc.CreatePaletteColor(r.Context(), req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// DeletePaletteColor handles DELETE /api/v1/calendar/palette/{id} (admin only).
func (h *CalendarHandler) DeletePaletteColor(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeletePaletteColor(r.Context(), id); err != nil {
		if errors.Is(err, model.ErrNotFound) {
			writeError(w, http.StatusNotFound, "color not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete color")
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

// UpsertMonthSettings handles PUT /api/v1/calendar/months/{year}/{month}/settings (admin only).
// Stores the accent color the admin picked in the inline color picker; the GET
// /calendar response surfaces it back so every visitor sees the same tint.
func (h *CalendarHandler) UpsertMonthSettings(w http.ResponseWriter, r *http.Request) {
	yearStr := chi.URLParam(r, "year")
	monthStr := chi.URLParam(r, "month")
	year, err1 := strconv.Atoi(yearStr)
	month, err2 := strconv.Atoi(monthStr)
	if err1 != nil || err2 != nil || month < 1 || month > 12 {
		writeError(w, http.StatusBadRequest, "invalid year or month")
		return
	}
	var req model.UpsertMonthSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := middleware.UserIDFromContext(r.Context())
	settings, err := h.svc.UpsertMonthSettings(r.Context(), year, month, req, userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
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
