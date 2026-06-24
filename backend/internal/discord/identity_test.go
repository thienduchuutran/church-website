package discord

import (
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func strptr(s string) *string { return &s }

func TestIdentityForAdmin_linked(t *testing.T) {
	a := &model.Admin{
		DisplayName:      strptr("Pastor Minh"),
		DiscordUsername:  strptr("pastorminh"),
		DiscordAvatarURL: strptr("https://cdn.discordapp.com/avatars/1/abc.png"),
	}
	id := IdentityForAdmin(a)
	if id.Username != "pastorminh" {
		t.Errorf("username = %q, want linked discord name", id.Username)
	}
	if id.AvatarURL != "https://cdn.discordapp.com/avatars/1/abc.png" {
		t.Errorf("avatar = %q, want linked discord avatar", id.AvatarURL)
	}
}

func TestIdentityForAdmin_unlinkedFallsBackToDisplayName(t *testing.T) {
	a := &model.Admin{DisplayName: strptr("Pastor Minh")}
	id := IdentityForAdmin(a)
	if id.Username != "Pastor Minh" {
		t.Errorf("username = %q, want display name fallback", id.Username)
	}
	if id.AvatarURL != defaultAvatarURL {
		t.Errorf("avatar = %q, want default church avatar", id.AvatarURL)
	}
}

func TestIdentityForAdmin_noAdminUsesDefaults(t *testing.T) {
	id := IdentityForAdmin(nil)
	if id.Username != defaultUsername || id.AvatarURL != defaultAvatarURL {
		t.Errorf("nil admin = %+v, want package defaults", id)
	}
}

func TestIdentityForAdmin_linkedNameWinsOverDisplayName(t *testing.T) {
	a := &model.Admin{DisplayName: strptr("Pastor Minh"), DiscordUsername: strptr("pastorminh")}
	if got := IdentityForAdmin(a).Username; got != "pastorminh" {
		t.Errorf("username = %q, want discord name to win over display name", got)
	}
}
