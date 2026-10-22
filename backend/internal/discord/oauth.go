package discord

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// Discord OAuth2 + API endpoints. Two scopes:
//   - `identify` returns the account itself: id, @handle, global display name,
//     avatar hash. No email, no guild list.
//   - `guilds.members.read` lets us read the admin's OWN member record in one
//     server (/users/@me/guilds/{id}/member), which is the only place Discord
//     exposes a server nickname and server avatar. Read-only, own record only.
//
// discordAPIBase is a var (not a const) so tests can point the package at an
// httptest server; production never changes it.
var discordAPIBase = "https://discord.com/api"

const (
	discordAuthorizeURL = "https://discord.com/api/oauth2/authorize"
	discordTokenURL     = "https://discord.com/api/oauth2/token"
	oauthScopes         = "identify guilds.members.read"
)

// ErrNotGuildMember is returned by FetchMember when Discord says the admin is
// not in the configured server (404). Callers treat it as "no nickname", not
// as a failure.
var ErrNotGuildMember = errors.New("discord: not a member of the configured guild")

// GuildID is the Discord server whose nicknames we post under. Empty means the
// member lookup is skipped and identity comes from the account alone - so a
// deploy without the var behaves exactly as before this feature.
func GuildID() string {
	return strings.TrimSpace(os.Getenv("DISCORD_GUILD_ID"))
}

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
	q.Set("scope", oauthScopes)
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordAPIBase+"/users/@me", nil)
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
		ID         string `json:"id"`
		Username   string `json:"username"`
		GlobalName string `json:"global_name"`
		Avatar     string `json:"avatar"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return DiscordUser{}, fmt.Errorf("decode user: %w", err)
	}
	return DiscordUser{
		ID:        u.ID,
		Username:  preferredName("", u.GlobalName, u.Username),
		AvatarURL: avatarURL(u.ID, u.Avatar),
	}, nil
}

// GuildMember is the slice of a Discord guild member record we care about:
// the per-server nickname and per-server avatar hash. Both are nullable on
// Discord's side and decode as "" when unset.
type GuildMember struct {
	Nick       string `json:"nick"`
	AvatarHash string `json:"avatar"`
}

// FetchMember reads the admin's own member record in guildID. Returns
// ErrNotGuildMember on 404 so the caller can tell "not in the server" apart
// from a real outage; both are non-fatal for linking, but the log line differs.
func FetchMember(ctx context.Context, accessToken, guildID string) (GuildMember, error) {
	endpoint := fmt.Sprintf("%s/users/@me/guilds/%s/member", discordAPIBase, url.PathEscape(guildID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return GuildMember{}, fmt.Errorf("build member request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return GuildMember{}, fmt.Errorf("fetch member: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return GuildMember{}, ErrNotGuildMember
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return GuildMember{}, fmt.Errorf("guild member status %d", resp.StatusCode)
	}

	var m GuildMember
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return GuildMember{}, fmt.Errorf("decode member: %w", err)
	}
	return m, nil
}

// ResolveIdentity is the one call the OAuth callback makes: the account
// profile first, then - only when DISCORD_GUILD_ID is set - the member record
// in that server, so the stored name is what the congregation already sees in
// Discord. The member step is best-effort: an admin who has not joined the
// server, or a Discord hiccup, still links successfully under their account
// name. Only the profile fetch can fail the link.
func ResolveIdentity(ctx context.Context, accessToken string) (DiscordUser, error) {
	user, err := FetchUser(ctx, accessToken)
	if err != nil {
		return DiscordUser{}, err
	}
	guildID := GuildID()
	if guildID == "" {
		return user, nil
	}
	member, err := FetchMember(ctx, accessToken, guildID)
	switch {
	case errors.Is(err, ErrNotGuildMember):
		log.Printf("discord link: %s is not a member of guild %s; using account identity", user.ID, guildID)
		return user, nil
	case err != nil:
		log.Printf("discord link: member lookup failed for %s: %v; using account identity", user.ID, err)
		return user, nil
	}
	return applyMember(user, &member, guildID), nil
}

// applyMember lays the server-specific identity over the account identity,
// field by field, keeping the account value wherever the member record is
// blank. Pure so the ladder is unit-testable without HTTP.
func applyMember(user DiscordUser, m *GuildMember, guildID string) DiscordUser {
	if m == nil {
		return user
	}
	if nick := strings.TrimSpace(m.Nick); nick != "" {
		user.Username = nick
	}
	if u := guildAvatarURL(guildID, user.ID, m.AvatarHash); u != "" {
		user.AvatarURL = u
	}
	return user
}

// preferredName is the name ladder: server nickname, then the account display
// name (global_name), then the unique @handle. Without it we would post under
// the handle ("sarahbearaht") instead of what the congregation knows ("Nghi").
func preferredName(nick, globalName, username string) string {
	if strings.TrimSpace(nick) != "" {
		return nick
	}
	if strings.TrimSpace(globalName) != "" {
		return globalName
	}
	return username
}

// guildAvatarURL builds the CDN URL for a per-server avatar. Empty hash means
// the member has no server avatar; we return "" so the caller keeps the
// account avatar rather than falling to the church default.
func guildAvatarURL(guildID, userID, hash string) string {
	if hash == "" {
		return ""
	}
	ext := "png"
	if strings.HasPrefix(hash, "a_") {
		ext = "gif"
	}
	return fmt.Sprintf("https://cdn.discordapp.com/guilds/%s/users/%s/avatars/%s.%s", guildID, userID, hash, ext)
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
