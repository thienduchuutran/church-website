package translation

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Model IDs and endpoints. Pinned constants so a model swap is a one-line
// code change with an obvious diff in `git blame`.
const (
	// 2026-06-24: Google retired gemini-2.0-flash (404 NOT_FOUND on /v1beta).
	// Bumped to gemini-2.5-flash - same v1beta endpoint shape, drop-in.
	geminiModel      = "gemini-2.5-flash"
	geminiAPIBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"

	httpTimeout = 30 * time.Second

	// Output cap for translate calls. A fixed generous ceiling on purpose -
	// never scaled from source length. Gemini 2.5+ thinks by default and its
	// thinking tokens count against maxOutputTokens, so a tight budget starves
	// the visible answer: a 64-token cap left 1 answer token after 59 thinking
	// tokens, which is how "VBS T-Shirt!" became just "Áo" in production.
	// 16384 covers the longest post body plus thinking headroom and is well
	// under both models' output limits.
	maxOutputTokens = 16384

	// Min source length to translate. One- or two-character strings are
	// usually punctuation or numbers - translating them wastes API calls
	// and confuses the model.
	minSourceLen = 3
)

// Translator is safe for concurrent use - the pool, http client, and prompt
// cache all protect their own state.
type Translator struct {
	pool        *pgxpool.Pool
	promptCache *PromptCache
	httpClient  *http.Client
	geminiKey   string
	supported   map[string]bool

	// API endpoint as a field, not a const, so tests can point the client at
	// an httptest server and prove truncated responses are rejected.
	geminiBaseURL string
}

// NewTranslator builds a translator. supportedLocales defaults to ["vi"] when
// the slice is empty, so callers that have not yet wired SUPPORTED_LOCALES
// from env still get sane behavior.
func NewTranslator(pool *pgxpool.Pool, geminiKey string, supportedLocales []string) *Translator {
	if len(supportedLocales) == 0 {
		supportedLocales = []string{"vi"}
	}
	set := make(map[string]bool, len(supportedLocales))
	for _, l := range supportedLocales {
		set[strings.TrimSpace(l)] = true
	}
	return &Translator{
		pool:          pool,
		promptCache:   NewPromptCache(),
		httpClient:    &http.Client{Timeout: httpTimeout},
		geminiKey:     geminiKey,
		supported:     set,
		geminiBaseURL: geminiAPIBaseURL,
	}
}

// TranslateField returns the translation of sourceText into targetLocale,
// persisting the result in the translations table along the way.
//
// Steps, in order:
//  1. Early-return sourceText when targetLocale is "en" or empty. The English
//     locale is the source of truth, never translated; this skip is the
//     reason an English-only visit costs zero API calls.
//  2. Trim and length-check. Strings under minSourceLen bypass the model.
//  3. Hash the trimmed source (sha256) and look up any prior translation
//     with the same hash + locale. A cache hit reuses the translated text
//     and only writes a new row keyed by record_id/field_name. This is what
//     makes a phrase repeated across posts a one-time cost.
//  4. On cache miss, load the system prompt and call Gemini.
//  5. Upsert by (record_id, field_name, locale). When the source has changed,
//     the new hash overrides the old translation and clears human approval -
//     intended behavior: human approvals only apply to the text they reviewed.
func (t *Translator) TranslateField(
	ctx context.Context,
	tableName, recordID, fieldName, sourceText, targetLocale string,
) (string, error) {
	if targetLocale == "" || targetLocale == "en" {
		return sourceText, nil
	}
	trimmed := strings.TrimSpace(sourceText)
	if len(trimmed) < minSourceLen {
		return sourceText, nil
	}

	hash := hashSource(trimmed)

	if cached, ok, err := t.lookupCached(ctx, hash, targetLocale); err != nil {
		log.Printf("translation cache lookup error (hash=%s locale=%s): %v", hash[:8], targetLocale, err)
	} else if ok {
		log.Printf("translation_cached field=%s locale=%s hash=%s", fieldName, targetLocale, hash[:8])
		if err := t.upsertTranslation(ctx, tableName, recordID, fieldName, targetLocale, hash, trimmed, cached); err != nil {
			return cached, fmt.Errorf("persist cached translation: %w", err)
		}
		return cached, nil
	}

	systemPrompt, err := t.promptCache.GetSystemPrompt(ctx, t.pool, SystemPromptKey)
	if err != nil {
		return "", err
	}

	translated, err := t.callGemini(ctx, systemPrompt, trimmed, maxOutputTokens)
	if err != nil {
		return "", err
	}
	translated = strings.TrimSpace(translated)
	if translated == "" {
		return "", errors.New("translation API returned empty result")
	}
	log.Printf("translation_api field=%s locale=%s model=%s chars=%d", fieldName, targetLocale, geminiModel, len(translated))

	if err := t.upsertTranslation(ctx, tableName, recordID, fieldName, targetLocale, hash, trimmed, translated); err != nil {
		return translated, fmt.Errorf("persist translation: %w", err)
	}
	return translated, nil
}

// TranslateRecord translates every (field, locale) pair on a job. Per-field
// failures are logged but do not abort the job - a partial translation is
// strictly better than none, since the COALESCE fallback on read covers any
// still-missing fields with the English source.
func (t *Translator) TranslateRecord(ctx context.Context, job TranslationJob) error {
	var firstErr error
	for _, locale := range job.TargetLocales {
		locale = strings.TrimSpace(locale)
		if locale == "" || locale == "en" {
			continue
		}
		if !t.supported[locale] {
			log.Printf("translation worker: skipping unsupported locale %q on job %s", locale, job.ID)
			continue
		}
		for field, source := range job.Fields {
			if _, err := t.TranslateField(ctx, job.TableName, job.RecordID, field, source, locale); err != nil {
				log.Printf("translation field failed (job=%s field=%s locale=%s): %v", job.ID, field, locale, err)
				if firstErr == nil {
					firstErr = err
				}
			}
		}
	}
	return firstErr
}

// hashSource produces a stable cache key for a piece of source text. The
// trim happens at the caller; this function only hashes what it gets.
func hashSource(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func (t *Translator) lookupCached(ctx context.Context, hash, locale string) (string, bool, error) {
	var translated string
	err := t.pool.QueryRow(ctx,
		`SELECT translated_text FROM translations
		 WHERE source_hash = $1 AND locale = $2
		 LIMIT 1`,
		hash, locale,
	).Scan(&translated)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return translated, true, nil
}

// upsertTranslation writes a translation row. The ON CONFLICT branch is the
// critical bit: when the source text changes, the new hash differs, the new
// translation replaces the old one, and approved_by is reset to NULL. This
// guarantees a human approval only applies to the exact text it was for.
func (t *Translator) upsertTranslation(
	ctx context.Context,
	tableName, recordID, fieldName, locale, hash, source, translated string,
) error {
	_, err := t.pool.Exec(ctx,
		`INSERT INTO translations
		   (table_name, record_id, field_name, locale,
		    source_hash, source_text, translated_text, is_ai_generated)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, true)
		 ON CONFLICT (record_id, field_name, locale)
		 DO UPDATE SET
		   translated_text = EXCLUDED.translated_text,
		   source_hash     = EXCLUDED.source_hash,
		   source_text     = EXCLUDED.source_text,
		   is_ai_generated = true,
		   approved_by     = NULL,
		   approved_at     = NULL,
		   updated_at      = now()`,
		tableName, recordID, fieldName, locale, hash, source, translated,
	)
	return err
}

// callGemini sends one translate request to Google's v1beta REST endpoint.
// Raw net/http on purpose - the SDK is large, and the request shape is
// simple enough that a struct + json.Marshal is clearer.
func (t *Translator) callGemini(ctx context.Context, system, user string, maxTokens int) (string, error) {
	if t.geminiKey == "" {
		return "", errors.New("GEMINI_API_KEY not configured")
	}
	body := map[string]any{
		"systemInstruction": map[string]any{
			"parts": []map[string]string{{"text": system}},
		},
		"contents": []map[string]any{
			{
				"role":  "user",
				"parts": []map[string]string{{"text": user}},
			},
		},
		"generationConfig": map[string]any{
			"temperature":     0.2,
			"maxOutputTokens": maxTokens,
		},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/%s:generateContent?key=%s", t.geminiBaseURL, geminiModel, t.geminiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini %d: %s", resp.StatusCode, truncate(string(b), 300))
	}

	var out struct {
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					Text    string `json:"text"`
					Thought bool   `json:"thought"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode gemini response: %w", err)
	}
	if len(out.Candidates) == 0 {
		return "", errors.New("gemini returned no candidates")
	}
	cand := out.Candidates[0]

	// Truncation and blocking arrive inside an HTTP 200 - the finish reason
	// is the only truthful success signal. Anything but STOP (MAX_TOKENS,
	// SAFETY, RECITATION, ...) means the text is not a faithful translation
	// and must never reach the database. This is the detector for the
	// "VBS T-Shirt!" -> "Áo" bug; see docs/agents/known-quirks.md.
	if cand.FinishReason != "STOP" {
		return "", fmt.Errorf("gemini finishReason=%s: partial or blocked output rejected", cand.FinishReason)
	}

	// Join every non-thought part - long answers can be split across parts,
	// and taking only the first would be one more silent-truncation path.
	var sb strings.Builder
	for _, p := range cand.Content.Parts {
		if !p.Thought {
			sb.WriteString(p.Text)
		}
	}
	if sb.Len() == 0 {
		return "", errors.New("gemini returned no text parts")
	}
	return sb.String(), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
