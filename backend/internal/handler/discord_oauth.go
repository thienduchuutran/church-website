package handler

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/thienduchuutran/church-website/backend/internal/discord"
	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// DiscordAdminStore is the slice of the admin repository this handler needs:
// read the current admin (for link status) and persist a freshly linked Discord
// identity. An interface so the handler can be tested with a fake.
type DiscordAdminStore interface {
	GetByEmail(ctx context.Context, email string) (*model.Admin, error)
	SetDiscordIdentity(ctx context.Context, email, userID, username, avatarURL string) error
}

type DiscordOAuthHandler struct {
	store       DiscordAdminStore
	frontendURL string // base URL the callback redirects back to (FRONTEND_ORIGIN)
}

func NewDiscordOAuthHandler(store DiscordAdminStore, frontendURL string) *DiscordOAuthHandler {
	return &DiscordOAuthHandler{store: store, frontendURL: strings.TrimRight(frontendURL, "/")}
}

// LinkStart (ADMIN-ONLY) returns the Discord consent URL for the frontend to
// send the browser to. We return a URL instead of redirecting here because a
// top-level browser navigation cannot carry the Bearer token - so the frontend
// fetches this endpoint WITH the token, then does window.location to the URL.
// The signed state embeds this admin's email so the public callback can trust
// who is linking without any auth header.
func (h *DiscordOAuthHandler) LinkStart(w http.ResponseWriter, r *http.Request) {
	if !discord.OAuthConfigured() {
		writeError(w, http.StatusServiceUnavailable, "discord linking is not configured")
		return
	}
	email := middleware.AdminEmailFromContext(r.Context())
	state, err := discord.SignState(email)
	if err != nil {
		log.Printf("discord link: sign state: %v", err)
		writeError(w, http.StatusInternalServerError, "could not start discord link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": discord.AuthorizeURL(state)})
}

// Status (ADMIN-ONLY) tells the composer/admin UI whether the current admin has
// linked Discord, and under what name/avatar, so it can show the linked state
// or a "link your Discord" nudge.
func (h *DiscordOAuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	email := middleware.AdminEmailFromContext(r.Context())
	admin, err := h.store.GetByEmail(r.Context(), email)
	if err != nil {
		log.Printf("discord status: load admin %q: %v", email, err)
		writeError(w, http.StatusInternalServerError, "could not read discord link status")
		return
	}

	resp := map[string]any{"linked": false}
	if admin != nil && admin.DiscordUsername != nil && *admin.DiscordUsername != "" {
		resp["linked"] = true
		resp["discord_username"] = *admin.DiscordUsername
		if admin.DiscordAvatarURL != nil {
			resp["discord_avatar_url"] = *admin.DiscordAvatarURL
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// Callback (PUBLIC) is where Discord redirects the browser after consent. It
// carries no Authorization header, so it MUST stay outside RequireAdmin - trust
// comes entirely from the HMAC-signed state, which proves which admin started
// the flow. On any failure it redirects back to the admin page with an error
// marker rather than leaking details to the browser.
func (h *DiscordOAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// The user denied consent, or Discord returned an error.
	if e := q.Get("error"); e != "" {
		log.Printf("discord callback: provider error %q", e)
		h.redirect(w, r, "error")
		return
	}

	code, state := q.Get("code"), q.Get("state")
	if code == "" || state == "" {
		h.redirect(w, r, "error")
		return
	}

	email, err := discord.VerifyState(state)
	if err != nil {
		log.Printf("discord callback: bad state: %v", err)
		h.redirect(w, r, "error")
		return
	}

	token, err := discord.ExchangeCode(r.Context(), code)
	if err != nil {
		log.Printf("discord callback: exchange code: %v", err)
		h.redirect(w, r, "error")
		return
	}

	user, err := discord.FetchUser(r.Context(), token)
	if err != nil {
		log.Printf("discord callback: fetch user: %v", err)
		h.redirect(w, r, "error")
		return
	}

	if err := h.store.SetDiscordIdentity(r.Context(), email, user.ID, user.Username, user.AvatarURL); err != nil {
		log.Printf("discord callback: persist identity for %q: %v", email, err)
		h.redirect(w, r, "error")
		return
	}

	h.redirect(w, r, "linked")
}

// redirect sends the browser back to the admin page with a ?discord=<status>
// marker the frontend reads to show a success/error toast.
func (h *DiscordOAuthHandler) redirect(w http.ResponseWriter, r *http.Request, status string) {
	base := h.frontendURL
	if base == "" {
		base = "/"
	}
	http.Redirect(w, r, base+"/admin?discord="+status, http.StatusSeeOther)
}
