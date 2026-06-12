package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// mockAssistantService implements AssistantService interface for testing.
type mockAssistantService struct {
	chatFn      func(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error)
	rateLimitFn func(ip string) bool
}

func (m *mockAssistantService) Chat(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error) {
	return m.chatFn(ctx, req)
}

func (m *mockAssistantService) CheckRateLimit(ip string) bool {
	if m.rateLimitFn != nil {
		return m.rateLimitFn(ip)
	}
	return false
}

func TestAssistantHandler_Chat_success(t *testing.T) {
	svc := &mockAssistantService{
		chatFn: func(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error) {
			if req.Message != "When is the next event?" {
				t.Errorf("unexpected message: %s", req.Message)
			}
			return model.AssistantChatResponse{
				Answer: "The next event is Easter Sunday on April 5.",
				Sources: []model.AssistantSource{
					{ID: "abc-123", Type: "post", Title: "Easter Sunday"},
				},
			}, nil
		},
	}

	h := NewAssistantHandler(svc)

	body, _ := json.Marshal(model.AssistantChatRequest{
		Message: "When is the next event?",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assistant/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Chat(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.AssistantChatResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.Answer == "" {
		t.Error("expected non-empty answer")
	}
	if len(resp.Sources) != 1 {
		t.Errorf("expected 1 source, got %d", len(resp.Sources))
	}
}

func TestAssistantHandler_Chat_emptyMessage(t *testing.T) {
	svc := &mockAssistantService{
		chatFn: func(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error) {
			t.Fatal("service should not be called for empty message")
			return model.AssistantChatResponse{}, nil
		},
	}

	h := NewAssistantHandler(svc)

	body, _ := json.Marshal(model.AssistantChatRequest{Message: ""})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assistant/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Chat(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAssistantHandler_Chat_serviceError(t *testing.T) {
	svc := &mockAssistantService{
		chatFn: func(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error) {
			return model.AssistantChatResponse{}, context.DeadlineExceeded
		},
	}

	h := NewAssistantHandler(svc)

	body, _ := json.Marshal(model.AssistantChatRequest{Message: "hello"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assistant/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Chat(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestAssistantHandler_Chat_invalidJSON(t *testing.T) {
	svc := &mockAssistantService{}

	h := NewAssistantHandler(svc)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/assistant/chat", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Chat(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAssistantHandler_Chat_rateLimited(t *testing.T) {
	svc := &mockAssistantService{
		rateLimitFn: func(ip string) bool {
			return true
		},
	}

	h := NewAssistantHandler(svc)

	body, _ := json.Marshal(model.AssistantChatRequest{Message: "hello"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assistant/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Chat(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}
}
