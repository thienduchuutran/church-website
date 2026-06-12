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

// SystemPromptKey is the row key in system_prompts the translator reads.
const SystemPromptKey = "vi_translation"

// PromptCache holds the latest system prompt body in memory, refreshed on TTL.
// Safe for concurrent use - the mutex guards both fields so a slow DB call
// cannot interleave with a fast cache-hit read.
type PromptCache struct {
	mu      sync.Mutex
	content string
	version string
	fetched time.Time
}

func NewPromptCache() *PromptCache { return &PromptCache{} }

// GetSystemPrompt returns the cached prompt body, refreshing from
// system_prompts when the cached copy is older than promptCacheTTL.
//
// If the DB read fails and a stale cached copy exists, the stale copy is
// returned rather than failing the translation. Rationale: a brief Supabase
// hiccup should not kill every translation in flight; the next TTL tick will
// retry the fetch.
func (c *PromptCache) GetSystemPrompt(ctx context.Context, pool *pgxpool.Pool, key string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.content != "" && time.Since(c.fetched) < promptCacheTTL {
		return c.content, nil
	}

	var content, version string
	err := pool.QueryRow(ctx,
		`SELECT content, version FROM system_prompts WHERE key = $1`, key,
	).Scan(&content, &version)
	if err != nil {
		if c.content != "" {
			return c.content, nil
		}
		return "", fmt.Errorf("load system prompt %q: %w", key, err)
	}

	c.content = content
	c.version = version
	c.fetched = time.Now()
	return content, nil
}

// Version returns the version string of the currently cached prompt. Useful
// for logging which prompt version produced a given translation.
func (c *PromptCache) Version() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.version
}
