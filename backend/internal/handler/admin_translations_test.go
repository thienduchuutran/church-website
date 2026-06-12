package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// mockAdminTranslationService is an in-memory stub of adminTranslationService
// so handler tests don't need a real DB - same pattern as mockPageService.
type mockAdminTranslationService struct {
	cleanupTranslations int
	cleanupJobs         int
	cleanupErr          error
}

func (m *mockAdminTranslationService) List(_ context.Context, _ repository.TranslationListFilters) (*model.TranslationListResponse, error) {
	return &model.TranslationListResponse{Items: []model.TranslationListItem{}}, nil
}

func (m *mockAdminTranslationService) Approve(_ context.Context, _, _ string, _ *string) (*model.Translation, error) {
	return &model.Translation{}, nil
}

func (m *mockAdminTranslationService) Retranslate(_ context.Context, _ string) (*model.Translation, error) {
	return &model.Translation{}, nil
}

func (m *mockAdminTranslationService) RetranslateAll(_ context.Context) (int, error) {
	return 0, nil
}

func (m *mockAdminTranslationService) CleanupOrphans(_ context.Context) (int, int, error) {
	return m.cleanupTranslations, m.cleanupJobs, m.cleanupErr
}

func TestAdminTranslationsHandler_CleanupOrphans_success(t *testing.T) {
	svc := &mockAdminTranslationService{cleanupTranslations: 3, cleanupJobs: 1}
	h := NewAdminTranslationsHandler(svc)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/translations/cleanup-orphans", nil)
	rec := httptest.NewRecorder()

	h.CleanupOrphans(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body)
	}
	var got map[string]int
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["deleted_translations"] != 3 {
		t.Fatalf("expected deleted_translations=3, got %d", got["deleted_translations"])
	}
	if got["deleted_jobs"] != 1 {
		t.Fatalf("expected deleted_jobs=1, got %d", got["deleted_jobs"])
	}
}

func TestAdminTranslationsHandler_CleanupOrphans_nothingToClean(t *testing.T) {
	svc := &mockAdminTranslationService{}
	h := NewAdminTranslationsHandler(svc)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/translations/cleanup-orphans", nil)
	rec := httptest.NewRecorder()

	h.CleanupOrphans(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on empty cleanup, got %d", rec.Code)
	}
	var got map[string]int
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got["deleted_translations"] != 0 || got["deleted_jobs"] != 0 {
		t.Fatalf("expected zero counts, got %v", got)
	}
}

func TestAdminTranslationsHandler_CleanupOrphans_serviceError(t *testing.T) {
	svc := &mockAdminTranslationService{cleanupErr: errors.New("db down")}
	h := NewAdminTranslationsHandler(svc)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/translations/cleanup-orphans", nil)
	rec := httptest.NewRecorder()

	h.CleanupOrphans(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d body=%s", rec.Code, rec.Body)
	}
}
