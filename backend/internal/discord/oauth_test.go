package discord

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreferredName(t *testing.T) {
	cases := []struct {
		name     string
		nick     string
		global   string
		username string
		want     string
	}{
		{"server nickname wins over everything", "Nghi", "sarahbear", "sarahbearaht", "Nghi"},
		{"no nickname falls to display name", "", "Duc", "_ductran_", "Duc"},
		{"no nickname, no display name falls to handle", "", "", "_ductran_", "_ductran_"},
		{"whitespace-only nickname is treated as absent", "  ", "Duc", "_ductran_", "Duc"},
		{"whitespace-only display name falls back", "", "   ", "handle", "handle"},
	}
	for _, c := range cases {
		if got := preferredName(c.nick, c.global, c.username); got != c.want {
			t.Errorf("%s: preferredName(%q, %q, %q) = %q, want %q", c.name, c.nick, c.global, c.username, got, c.want)
		}
	}
}

func TestGuildAvatarURL(t *testing.T) {
	if got := guildAvatarURL("g1", "u1", "abc"); got != "https://cdn.discordapp.com/guilds/g1/users/u1/avatars/abc.png" {
		t.Errorf("static guild avatar: got %q", got)
	}
	if got := guildAvatarURL("g1", "u1", "a_abc"); got != "https://cdn.discordapp.com/guilds/g1/users/u1/avatars/a_abc.gif" {
		t.Errorf("animated guild avatar: got %q", got)
	}
	if got := guildAvatarURL("g1", "u1", ""); got != "" {
		t.Errorf("empty hash must yield empty string (no override), got %q", got)
	}
}

// applyMember is the pure ladder: a member record overrides the account
// identity only where it actually has something.
func TestApplyMember(t *testing.T) {
	base := DiscordUser{ID: "u1", Username: "Duc", AvatarURL: "https://cdn/avatars/u1/x.png"}

	t.Run("nil member keeps account identity", func(t *testing.T) {
		got := applyMember(base, nil, "g1")
		if got != base {
			t.Errorf("got %+v, want %+v", got, base)
		}
	})

	t.Run("nickname overrides name, no guild avatar keeps account avatar", func(t *testing.T) {
		got := applyMember(base, &GuildMember{Nick: "Nghi"}, "g1")
		if got.Username != "Nghi" {
			t.Errorf("username = %q, want Nghi", got.Username)
		}
		if got.AvatarURL != base.AvatarURL {
			t.Errorf("avatar changed to %q, want account avatar kept", got.AvatarURL)
		}
	})

	t.Run("guild avatar overrides account avatar", func(t *testing.T) {
		got := applyMember(base, &GuildMember{AvatarHash: "h1"}, "g1")
		want := "https://cdn.discordapp.com/guilds/g1/users/u1/avatars/h1.png"
		if got.AvatarURL != want {
			t.Errorf("avatar = %q, want %q", got.AvatarURL, want)
		}
		if got.Username != "Duc" {
			t.Errorf("username changed to %q, want Duc kept", got.Username)
		}
	})

	t.Run("blank nickname keeps account name", func(t *testing.T) {
		got := applyMember(base, &GuildMember{Nick: "   "}, "g1")
		if got.Username != "Duc" {
			t.Errorf("username = %q, want Duc", got.Username)
		}
	})
}

// withFakeDiscordAPI points the package at an httptest server for one test.
func withFakeDiscordAPI(t *testing.T, h http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(h)
	prev := discordAPIBase
	discordAPIBase = srv.URL
	t.Cleanup(func() {
		discordAPIBase = prev
		srv.Close()
	})
}

func TestFetchMember_success(t *testing.T) {
	withFakeDiscordAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/@me/guilds/g1/member" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("auth header = %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"nick":"Nghi","avatar":"h1","user":{"id":"u1","username":"sarahbearaht"}}`))
	})
	m, err := FetchMember(context.Background(), "tok", "g1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.Nick != "Nghi" || m.AvatarHash != "h1" {
		t.Errorf("member = %+v", m)
	}
}

func TestFetchMember_nullNickDecodesAsEmpty(t *testing.T) {
	withFakeDiscordAPI(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"nick":null,"avatar":null}`))
	})
	m, err := FetchMember(context.Background(), "tok", "g1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.Nick != "" || m.AvatarHash != "" {
		t.Errorf("null fields should decode as empty, got %+v", m)
	}
}

func TestFetchMember_notAMember(t *testing.T) {
	withFakeDiscordAPI(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	_, err := FetchMember(context.Background(), "tok", "g1")
	if !errors.Is(err, ErrNotGuildMember) {
		t.Fatalf("want ErrNotGuildMember, got %v", err)
	}
}

func TestFetchMember_serverError(t *testing.T) {
	withFakeDiscordAPI(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	_, err := FetchMember(context.Background(), "tok", "g1")
	if err == nil || errors.Is(err, ErrNotGuildMember) {
		t.Fatalf("want a generic error, got %v", err)
	}
}

// ResolveIdentity is what the callback calls: profile, then (if a guild is
// configured) the member record, never failing the link over the member step.
func TestResolveIdentity(t *testing.T) {
	serve := func(memberStatus int, memberBody string) {
		withFakeDiscordAPI(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/users/@me":
				_, _ = w.Write([]byte(`{"id":"u1","username":"sarahbearaht","global_name":"","avatar":"acc"}`))
			case "/users/@me/guilds/g1/member":
				w.WriteHeader(memberStatus)
				_, _ = w.Write([]byte(memberBody))
			default:
				t.Errorf("unexpected path %q", r.URL.Path)
			}
		})
	}

	t.Run("no guild configured skips the member call", func(t *testing.T) {
		t.Setenv("DISCORD_GUILD_ID", "")
		serve(http.StatusInternalServerError, "")
		u, err := ResolveIdentity(context.Background(), "tok")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.Username != "sarahbearaht" {
			t.Errorf("username = %q", u.Username)
		}
	})

	t.Run("guild configured and member found uses the nickname", func(t *testing.T) {
		t.Setenv("DISCORD_GUILD_ID", "g1")
		serve(http.StatusOK, `{"nick":"Nghi","avatar":null}`)
		u, err := ResolveIdentity(context.Background(), "tok")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.Username != "Nghi" {
			t.Errorf("username = %q, want Nghi", u.Username)
		}
		if u.AvatarURL != "https://cdn.discordapp.com/avatars/u1/acc.png" {
			t.Errorf("avatar = %q, want account avatar kept", u.AvatarURL)
		}
	})

	t.Run("not a member falls back to account identity without error", func(t *testing.T) {
		t.Setenv("DISCORD_GUILD_ID", "g1")
		serve(http.StatusNotFound, "")
		u, err := ResolveIdentity(context.Background(), "tok")
		if err != nil {
			t.Fatalf("link must not fail when the admin is not in the server: %v", err)
		}
		if u.Username != "sarahbearaht" {
			t.Errorf("username = %q", u.Username)
		}
	})

	t.Run("member lookup outage falls back without error", func(t *testing.T) {
		t.Setenv("DISCORD_GUILD_ID", "g1")
		serve(http.StatusBadGateway, "")
		u, err := ResolveIdentity(context.Background(), "tok")
		if err != nil {
			t.Fatalf("link must not fail on a member lookup outage: %v", err)
		}
		if u.Username != "sarahbearaht" {
			t.Errorf("username = %q", u.Username)
		}
	})
}

func TestAuthorizeURL_requestsMemberScope(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_CLIENT_ID", "cid")
	t.Setenv("DISCORD_OAUTH_REDIRECT_URI", "https://x/cb")
	u := AuthorizeURL("st")
	if want := "scope=identify+guilds.members.read"; !strings.Contains(u, want) {
		t.Errorf("authorize URL missing %q: %s", want, u)
	}
}
