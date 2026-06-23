package discord

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// stateTTL bounds how long an OAuth link attempt stays valid. Ten minutes is
// plenty for a human to click through Discord's consent screen, and short
// enough that a leaked state is useless soon after.
const stateTTL = 10 * time.Minute

// SignState produces an opaque, tamper-proof token carrying the admin's email
// through the OAuth round-trip. The callback is a bare browser redirect with no
// Authorization header, so this HMAC is the ONLY thing proving which admin
// started the link: without the server secret a forged state cannot be minted,
// so an attacker cannot bind their Discord account to someone else's admin row.
func SignState(email string) (string, error) {
	secret := os.Getenv("DISCORD_OAUTH_STATE_SECRET")
	if secret == "" {
		return "", fmt.Errorf("DISCORD_OAUTH_STATE_SECRET not set")
	}
	exp := strconv.FormatInt(time.Now().Add(stateTTL).Unix(), 10)
	payload := email + "|" + exp
	raw := payload + "|" + sign(payload, secret)
	return base64.RawURLEncoding.EncodeToString([]byte(raw)), nil
}

// VerifyState checks the signature and expiry and returns the embedded email.
// hmac.Equal is used for the comparison so it is constant-time (no timing
// oracle on the signature).
func VerifyState(state string) (string, error) {
	secret := os.Getenv("DISCORD_OAUTH_STATE_SECRET")
	if secret == "" {
		return "", fmt.Errorf("DISCORD_OAUTH_STATE_SECRET not set")
	}
	raw, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return "", fmt.Errorf("decode state: %w", err)
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 3 {
		return "", fmt.Errorf("malformed state")
	}
	email, exp, sig := parts[0], parts[1], parts[2]

	if !hmac.Equal([]byte(sig), []byte(sign(email+"|"+exp, secret))) {
		return "", fmt.Errorf("bad signature")
	}
	ts, err := strconv.ParseInt(exp, 10, 64)
	if err != nil {
		return "", fmt.Errorf("bad expiry")
	}
	if time.Now().Unix() > ts {
		return "", fmt.Errorf("state expired")
	}
	return email, nil
}

func sign(payload, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
