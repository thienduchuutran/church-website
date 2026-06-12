package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// AssistantServiceInterface defines the contract the handler depends on.
// The concrete AssistantService in service/ implements this; tests swap in a mock.
type AssistantServiceInterface interface {
	Chat(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error)
	CheckRateLimit(ip string) bool
}

// AssistantHandler handles HTTP requests for the AI church assistant chatbox.
type AssistantHandler struct {
	svc AssistantServiceInterface
}

// NewAssistantHandler creates a new handler for the assistant chat endpoint.
func NewAssistantHandler(svc AssistantServiceInterface) *AssistantHandler {
	return &AssistantHandler{svc: svc}
}

// Chat handles POST /api/v1/assistant/chat.
// It parses the visitor's message, validates it, checks the rate limit, calls the RAG service,
// and returns the AI-generated answer with source references.
func (h *AssistantHandler) Chat(w http.ResponseWriter, r *http.Request) {
	// Extract client IP address for rate limiting.
	ip := r.Header.Get("X-Forwarded-For")
	if ip == "" {
		ip = r.RemoteAddr
	}
	// Strip port if present in RemoteAddr (e.g. "127.0.0.1:12345")
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}

	if h.svc.CheckRateLimit(ip) {
		http.Error(w, `{"error":"too many requests, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	var req model.AssistantChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, `{"error":"message is required"}`, http.StatusBadRequest)
		return
	}

	// Cap message length to prevent abuse.
	if len(req.Message) > 1000 {
		http.Error(w, `{"error":"message too long (max 1000 characters)"}`, http.StatusBadRequest)
		return
	}

	resp, err := h.svc.Chat(r.Context(), req)
	if err != nil {
		log.Printf("assistant chat error: %v", err)
		http.Error(w, `{"error":"failed to process your question"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("assistant: encode response error: %v", err)
	}
}
