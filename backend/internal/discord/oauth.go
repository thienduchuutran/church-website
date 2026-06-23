package discord

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// Discord OAuth2 + API endpoints. scope `identify` is all we need: it returns
// the user's id, username, and avatar hash, and nothing else (no email, no
// guild list), keeping the consent screen minimal.
const (
	discordAuthorizeURL = "https://discord.com/api/oauth2/authorize"
	discordTokenURL     = "https://discord.com/api/oauth2/token"
	discordUserURL      = "https://discord.com/api/users/@me"
)

// OAuthConfigured reports whether the Discord link flow has the env vars it
// needs. When false the handler returns 503 instead of starting a broken flow,
// mirroring how the rest of the app degrades gracefully on missing config.
func OAuthConfigured() bool {
	return os.Getenv("DISCORD_OAUTH_CLIENT_ID") != "" &&
		os.Getenv("DISCORD_OAUTH_CLIENT_SECRET") != "" &&
		os.Getenv("DISCORD_OAUTH_REDIRECT_URI") != ""
}

// AuthorizeURL builds the Discord consent URL the admin's browser is sent to.
func AuthorizeURL(state string) string {
	q := url.Values{}
	q.Set("client_id", os.Getenv("DISCORD_OAUTH_CLIENT_ID"))
	q.Set("redirect_uri", os.Getenv("DISCORD_OAUTH_REDIRECT_URI"))
	q.Set("response_type", "code")
	q.Set("scope", "identify")
	q.Set("state", state)
	q.Set("prompt", "consent")
	return discordAuthorizeURL + "?" + q.Encode()
}

// DiscordUser is the linked account, with the avatar already resolved to a CDN
// URL so callers never have to know the id+hash construction.
type DiscordUser struct {
	ID        string
	Username  string
	AvatarURL string
}

// ExchangeCode swaps the one-time OAuth code for a short-lived access token.
func ExchangeCode(ctx context.Context, code string) (string, error) {
	form := url.Values{}
	form.Set("client_id", os.Getenv("DISCORD_OAUTH_CLIENT_ID"))
	form.Set("client_secret", os.Getenv("DISCORD_OAUTH_CLIENT_SECRET"))
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", os.Getenv("DISCORD_OAUTH_REDIRECT_URI"))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, discordTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("token exchange status %d", resp.StatusCode)
	}

	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("empty access token")
	}
	return tok.AccessToken, nil
}

// FetchUser reads the linked Discord account via /users/@me and resolves the
// avatar to a CDN URL.
func FetchUser(ctx context.Context, accessToken string) (DiscordUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordUserURL, nil)
	if err != nil {
		return DiscordUser{}, fmt.Errorf("build user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return DiscordUser{}, fmt.Errorf("fetch user: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return DiscordUser{}, fmt.Errorf("users/@me status %d", resp.StatusCode)
	}

	var u struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Avatar   string `json:"avatar"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return DiscordUser{}, fmt.Errorf("decode user: %w", err)
	}
	return DiscordUser{
		ID:        u.ID,
		Username:  u.Username,
		AvatarURL: avatarURL(u.ID, u.Avatar),
	}, nil
}

// avatarURL builds the CDN URL from a user id + avatar hash. A user with no
// custom avatar (empty hash) falls back to the default church avatar. Animated
// avatars (hash prefixed "a_") are served as .gif.
func avatarURL(id, hash string) string {
	if hash == "" {
		return defaultAvatarURL
	}
	ext := "png"
	if strings.HasPrefix(hash, "a_") {
		ext = "gif"
	}
	return fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.%s", id, hash, ext)
}
