package middleware_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	mw "github.com/thienduchuutran/church-website/backend/internal/middleware"
)

type fakeAdminChecker struct {
	emails map[string]bool
}

func (f *fakeAdminChecker) AdminExists(_ context.Context, email string) (bool, error) {
	return f.emails[email], nil
}

func generateES256Key(t *testing.T) *ecdsa.PrivateKey {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}
	return key
}

func signJWT(claims jwt.MapClaims, privateKey *ecdsa.PrivateKey, kid string) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	tok.Header["kid"] = kid
	s, _ := tok.SignedString(privateKey)
	return s
}

func newTestJWKSCacheForToken(kid string, key *ecdsa.PublicKey) *mw.JWKSCache {
	cache := mw.NewJWKSCache()
	cache.SetKey(kid, key)
	return cache
}

func TestRequireAdmin_NoHeader(t *testing.T) {
	cache := mw.NewJWKSCache()
	h := mw.RequireAdmin(&fakeAdminChecker{}, cache)(
		http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("handler should not be called")
		}),
	)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestRequireAdmin_InvalidToken(t *testing.T) {
	cache := mw.NewJWKSCache()
	h := mw.RequireAdmin(&fakeAdminChecker{}, cache)(
		http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("handler should not be called")
		}),
	)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestRequireAdmin_NonAdmin(t *testing.T) {
	checker := &fakeAdminChecker{emails: map[string]bool{}}
	key := generateES256Key(t)
	cache := newTestJWKSCacheForToken("test-kid", &key.PublicKey)
	token := signJWT(jwt.MapClaims{
		"email": "nobody@test.com",
		"sub":   "user-456",
		"exp":   time.Now().Add(time.Hour).Unix(),
	}, key, "test-kid")

	h := mw.RequireAdmin(checker, cache)(
		http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("handler should not be called")
		}),
	)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestRequireAdmin_ValidAdmin(t *testing.T) {
	checker := &fakeAdminChecker{emails: map[string]bool{"admin@test.com": true}}
	key := generateES256Key(t)
	cache := newTestJWKSCacheForToken("test-kid", &key.PublicKey)
	token := signJWT(jwt.MapClaims{
		"email": "admin@test.com",
		"sub":   "user-123",
		"exp":   time.Now().Add(time.Hour).Unix(),
	}, key, "test-kid")

	var gotEmail, gotUserID string
	h := mw.RequireAdmin(checker, cache)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotEmail = mw.AdminEmailFromContext(r.Context())
			gotUserID = mw.UserIDFromContext(r.Context())
			w.WriteHeader(http.StatusOK)
		}),
	)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if gotEmail != "admin@test.com" {
		t.Fatalf("expected email admin@test.com, got %q", gotEmail)
	}
	if gotUserID != "user-123" {
		t.Fatalf("expected user ID user-123, got %q", gotUserID)
	}
}
