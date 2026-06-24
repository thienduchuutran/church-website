package discord

import (
	"encoding/json"
	"testing"
)

// The default must serialize as "parse":[] (an explicit empty array), never
// "parse":null - null tells Discord to use defaults, which would let a stray
// @everyone in the body actually ping the whole server.
func TestNoMentions_serializesAsEmptyArrayNotNull(t *testing.T) {
	b, err := json.Marshal(NoMentions())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got := string(b); got != `{"parse":[]}` {
		t.Errorf("NoMentions JSON = %s, want {\"parse\":[]}", got)
	}
}

func TestEveryoneMention_serializesEveryone(t *testing.T) {
	b, err := json.Marshal(EveryoneMention())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got := string(b); got != `{"parse":["everyone"]}` {
		t.Errorf("EveryoneMention JSON = %s, want everyone parse", got)
	}
}
