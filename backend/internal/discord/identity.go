package discord

import "github.com/thienduchuutran/church-website/backend/internal/model"

// SenderIdentity is the name + avatar a single webhook message is posted under.
// Discord webhooks allow overriding these per message, which is what lets every
// admin's post appear under their own Discord identity through one shared
// webhook - no per-admin webhook provisioning required.
type SenderIdentity struct {
	Username  string
	AvatarURL string
}

// IdentityForAdmin resolves the Discord sender for the admin who wrote a post.
// A linked admin posts under their own Discord name + avatar. An admin who has
// not linked Discord falls back to their display name (or the default church
// username) and the default church avatar - so posting always works, linked or
// not (acceptance: an unlinked admin can still post).
func IdentityForAdmin(a *model.Admin) SenderIdentity {
	id := SenderIdentity{Username: defaultUsername, AvatarURL: defaultAvatarURL}
	if a == nil {
		return id
	}

	switch {
	case a.DiscordUsername != nil && *a.DiscordUsername != "":
		id.Username = *a.DiscordUsername
	case a.DisplayName != nil && *a.DisplayName != "":
		id.Username = *a.DisplayName
	}

	if a.DiscordAvatarURL != nil && *a.DiscordAvatarURL != "" {
		id.AvatarURL = *a.DiscordAvatarURL
	}

	return id
}
