package discord

// AllowedMentions controls which mentions in a message actually notify people.
// Discord treats an explicitly empty Parse array as "suppress every mention",
// so stray "@everyone" or "@role" text typed into a post body is rendered but
// pings no one unless we deliberately opt in. The empty slice MUST be non-nil:
// a nil slice marshals to JSON null, which Discord reads as "use defaults"
// (which would ping). NoMentions guarantees the non-nil empty slice.
type AllowedMentions struct {
	Parse []string `json:"parse"`
}

// NoMentions is the safe default applied to every message: nothing pings.
func NoMentions() AllowedMentions {
	return AllowedMentions{Parse: []string{}}
}

// EveryoneMention opts a single message into pinging @everyone. Used only when
// the admin ticks the per-post "Notify @everyone" box in the composer.
func EveryoneMention() AllowedMentions {
	return AllowedMentions{Parse: []string{"everyone"}}
}
