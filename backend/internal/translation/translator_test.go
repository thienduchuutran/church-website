package translation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestTranslator builds a Translator pointed at a fake API server. No DB
// pool on purpose - callGemini never touches it, and these tests exist to
// prove the HTTP layer refuses truncated or blocked responses before
// anything could be persisted.
func newTestTranslator(serverURL string) *Translator {
	return &Translator{
		httpClient:    &http.Client{Timeout: 5 * time.Second},
		geminiKey:     "test-key",
		geminiBaseURL: serverURL,
	}
}

func jsonServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

func TestCallGemini_success(t *testing.T) {
	srv := jsonServer(t, `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Áo thun VBS!"}]}}]}`)
	defer srv.Close()

	got, err := newTestTranslator(srv.URL).callGemini(context.Background(), "sys", "VBS T-Shirt!", 64)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "Áo thun VBS!" {
		t.Fatalf("got %q, want %q", got, "Áo thun VBS!")
	}
}

// The production bug: thinking tokens exhausted maxOutputTokens, Gemini
// returned HTTP 200 with a one-token stump and finishReason MAX_TOKENS, and
// the stump was persisted as a valid translation. This must be an error.
func TestCallGemini_maxTokensIsError(t *testing.T) {
	srv := jsonServer(t, `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"Áo"}]}}]}`)
	defer srv.Close()

	_, err := newTestTranslator(srv.URL).callGemini(context.Background(), "sys", "VBS T-Shirt!", 64)
	if err == nil {
		t.Fatal("want error on finishReason MAX_TOKENS, got nil")
	}
	if !strings.Contains(err.Error(), "MAX_TOKENS") {
		t.Fatalf("error should name the finish reason, got: %v", err)
	}
}

// Any non-STOP finish (SAFETY, RECITATION, ...) means the text is not a
// faithful translation - refuse it rather than persist it.
func TestCallGemini_safetyIsError(t *testing.T) {
	srv := jsonServer(t, `{"candidates":[{"finishReason":"SAFETY","content":{"parts":[{"text":""}]}}]}`)
	defer srv.Close()

	_, err := newTestTranslator(srv.URL).callGemini(context.Background(), "sys", "text", 64)
	if err == nil {
		t.Fatal("want error on finishReason SAFETY, got nil")
	}
}

// Long answers can arrive split across several parts; taking only parts[0]
// would be one more silent-truncation path. All parts must be joined, and
// thought-summary parts (thought: true) must be excluded from the output.
func TestCallGemini_joinsPartsAndSkipsThoughts(t *testing.T) {
	srv := jsonServer(t, `{"candidates":[{"finishReason":"STOP","content":{"parts":[
		{"text":"internal reasoning","thought":true},
		{"text":"Phần một. "},
		{"text":"Phần hai."}
	]}}]}`)
	defer srv.Close()

	got, err := newTestTranslator(srv.URL).callGemini(context.Background(), "sys", "Part one. Part two.", 64)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "Phần một. Phần hai." {
		t.Fatalf("got %q, want joined non-thought parts", got)
	}
}
