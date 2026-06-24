package discord

import "testing"

func TestPreferredName(t *testing.T) {
	cases := []struct {
		name     string
		global   string
		username string
		want     string
	}{
		{"display name wins over handle", "Duc", "_ductran_", "Duc"},
		{"no display name falls back to handle", "", "_ductran_", "_ductran_"},
		{"whitespace-only display name falls back", "   ", "handle", "handle"},
	}
	for _, c := range cases {
		if got := preferredName(c.global, c.username); got != c.want {
			t.Errorf("%s: preferredName(%q, %q) = %q, want %q", c.name, c.global, c.username, got, c.want)
		}
	}
}
