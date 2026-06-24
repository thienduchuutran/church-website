package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// fakeDiscordStore is an in-memory DiscordAdminStore for handler tests.
type fakeDiscordStore struct {
	admin     *model.Admin
	getErr    error
	setCalled bool
	setEmail  string
}

func (f *fakeDiscordStore) GetByEmail(_ context.Context, _ string) (*model.Admin, error) {
	return f.admin, f.getErr
}

func (f *fakeDiscordStore) SetDiscordIdentity(_ context.Context, email, _, _, _ string) error {
	f.setCalled = true
	f.setEmail = email
	return nil
}

func ctxWithEmail(r *http.Request, email string) *http.Request {
	return r.WithContext(middleware.WithAdminEmail(r.Context(), email))
}

func TestDiscordLinkStart_notConfigured(t *testing.T) {
	// Ensure the OAuth env is unset so OAuthConfigured() is false.
	t.Setenv("DISCORD_OAUTH_CLIENT_ID", "")
	t.Setenv("DISCORD_OAUTH_CLIENT_SECRET", "")
	t.Setenv("DISCORD_OAUTH_REDIRECT_URI", "")

	h := NewDiscordOAuthHandler(&fakeDiscordStore{}, "")
	rec := httptest.NewRecorder()
	req := ctxWithEmail(httptest.NewRequest(http.MethodGet, "/admin/discord/link", nil), "a@church.org")

	h.LinkStart(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503 when OAuth is not configured", rec.Code)
	}
}

func TestDiscordStatus_unlinked(t *testing.T) {
	h := NewDiscordOAuthHandler(&fakeDiscordStore{admin: &model.Admin{Email: "a@church.org"}}, "")
	rec := httptest.NewRecorder()
	req := ctxWithEmail(httptest.NewRequest(http.MethodGet, "/admin/discord/status", nil), "a@church.org")

	h.Status(rec, req)

	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["linked"] != false {
		t.Errorf("linked = %v, want false for an unlinked admin", body["linked"])
	}
}

func TestDiscordStatus_linked(t *testing.T) {
	name := "pastorminh"
	h := NewDiscordOAuthHandler(&fakeDiscordStore{
		admin: &model.Admin{Email: "a@church.org", DiscordUsername: &name},
	}, "")
	rec := httptest.NewRecorder()
	req := ctxWithEmail(httptest.NewRequest(http.MethodGet, "/admin/discord/status", nil), "a@church.org")

	h.Status(rec, req)

	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["linked"] != true {
		t.Errorf("linked = %v, want true", body["linked"])
	}
	if body["discord_username"] != "pastorminh" {
		t.Errorf("discord_username = %v, want pastorminh", body["discord_username"])
	}
}

// The security guarantee: a callback with an unverifiable state must NOT persist
// any identity, and must bounce the browser back with an error marker.
func TestDiscordCallback_badStateDoesNotPersist(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "test-secret")
	store := &fakeDiscordStore{}
	h := NewDiscordOAuthHandler(store, "https://site.test")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/discord/callback?code=abc&state=forged", nil)

	h.Callback(rec, req)

	if store.setCalled {
		t.Error("SetDiscordIdentity must not be called for an invalid state")
	}
	if rec.Code != http.StatusSeeOther {
		t.Errorf("status = %d, want 303 redirect", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "https://site.test/admin?discord=error" {
		t.Errorf("redirect = %q, want the admin error redirect", loc)
	}
}
