package translation

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// promptCacheTTL bounds how stale the in-memory system prompt can be. Five
// minutes is the deliberate trade: short enough that an edit to
// system_prompts in Supabase reaches the running server without a redeploy,
// long enough that a quiet hour of translations does not hammer Postgres.
const promptCacheTTL = 5 * time.Minute

// SystemPromptKey is the row key in system_prompts for EN -> VI translation.
// Kept as a named constant (rather than folded into PromptKeyFor) because it is
// also the key the sync-prompt script and the docs refer to.
const SystemPromptKey = "vi_translation"

// ReversePromptKey is the row key for VI -> EN, seeded by migration 000013. The
// two prompts are NOT mirror images of each other at runtime - each encodes a
// one-way glossary and its own register instructions.
const ReversePromptKey = "en_translation"

// PromptKeyFor maps a target locale to the system_prompts row that translates
// *into* it. Unknown locales fall back to the Vietnamese prompt, matching the
// pre-000013 behavior where that was the only prompt in existence.
func PromptKeyFor(targetLocale string) string {
	switch normalizeLocale(targetLocale) {
	case "en":
		return ReversePromptKey
	default:
		return SystemPromptKey
	}
}

// promptEntry is one cached prompt body.
type promptEntry struct {
	content string
	version string
	fetched time.Time
}

// PromptCache holds system prompt bodies in memory, refreshed on TTL.
// Safe for concurrent use - the mutex guards the whole map so a slow DB call
// cannot interleave with a fast cache-hit read.
//
// Keyed by prompt key. It has to be: the cache used to hold a single content
// string while still accepting a key argument, so once a second prompt existed
// (en_translation, migration 000013) whichever direction translated first would
// have served its prompt to the other one for the rest of the TTL - producing
// Vietnamese output for an English target with no error anywhere.
type PromptCache struct {
	mu      sync.Mutex
	entries map[string]*promptEntry
}

func NewPromptCache() *PromptCache {
	return &PromptCache{entries: make(map[string]*promptEntry)}
}

// GetSystemPrompt returns the cached prompt body, refreshing from
// system_prompts when the cached copy is older than promptCacheTTL.
//
// If the DB read fails and a stale cached copy exists, the stale copy is
// returned rather than failing the translation. Rationale: a brief Supabase
// hiccup should not kill every translation in flight; the next TTL tick will
// retry the fetch.
// The staleness fallback is per key, so a failure to refresh en_translation
// cannot serve vi_translation's body in its place.
func (c *PromptCache) GetSystemPrompt(ctx context.Context, pool *pgxpool.Pool, key string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	cached := c.entries[key]
	if cached != nil && cached.content != "" && time.Since(cached.fetched) < promptCacheTTL {
		return cached.content, nil
	}

	var content, version string
	err := pool.QueryRow(ctx,
		`SELECT content, version FROM system_prompts WHERE key = $1`, key,
	).Scan(&content, &version)
	if err != nil {
		if cached != nil && cached.content != "" {
			return cached.content, nil
		}
		return "", fmt.Errorf("load system prompt %q: %w", key, err)
	}

	c.entries[key] = &promptEntry{content: content, version: version, fetched: time.Now()}
	return content, nil
}

// Version returns the version string of the cached prompt for key, or "" if it
// has not been loaded yet. Useful for logging which prompt version produced a
// given translation - and now which *direction*, since the two prompts version
// independently.
func (c *PromptCache) Version(key string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e := c.entries[key]; e != nil {
		return e.version
	}
	return ""
}
