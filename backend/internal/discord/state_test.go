package discord

import "testing"

func TestState_roundTrip(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "test-secret")

	state, err := SignState("admin@church.org")
	if err != nil {
		t.Fatalf("SignState: %v", err)
	}
	email, err := VerifyState(state)
	if err != nil {
		t.Fatalf("VerifyState: %v", err)
	}
	if email != "admin@church.org" {
		t.Errorf("email = %q, want admin@church.org", email)
	}
}

func TestState_tamperedSignatureRejected(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "test-secret")
	state, _ := SignState("admin@church.org")

	// Flip the last character to corrupt the signature.
	bad := state[:len(state)-1] + "Z"
	if bad == state {
		bad = state[:len(state)-1] + "Y"
	}
	if _, err := VerifyState(bad); err == nil {
		t.Error("expected tampered state to be rejected")
	}
}

func TestState_differentSecretRejected(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "secret-a")
	state, _ := SignState("admin@church.org")

	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "secret-b")
	if _, err := VerifyState(state); err == nil {
		t.Error("expected state signed with a different secret to be rejected")
	}
}

func TestState_missingSecretErrors(t *testing.T) {
	t.Setenv("DISCORD_OAUTH_STATE_SECRET", "")
	if _, err := SignState("admin@church.org"); err == nil {
		t.Error("expected error when state secret is unset")
	}
}
