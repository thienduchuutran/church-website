package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// JWKSCache holds Supabase public keys fetched from their JWKS endpoint.
type JWKSCache struct {
	mu       sync.RWMutex
	keys     map[string]*ecdsa.PublicKey
	cachedAt time.Time
}

// JWKS response structure from Supabase.
type jwksResponse struct {
	Keys []struct {
		Kty string `json:"kty"`
		Use string `json:"use"`
		Kid string `json:"kid"`
		X   string `json:"x"`
		Y   string `json:"y"`
		Crv string `json:"crv"`
	} `json:"keys"`
}

// NewJWKSCache creates a new cache instance.
func NewJWKSCache() *JWKSCache {
	return &JWKSCache{
		keys: make(map[string]*ecdsa.PublicKey),
	}
}

// FetchAndCacheKeys fetches keys from Supabase JWKS endpoint and caches them.
// Cache is valid for 1 hour.
func (j *JWKSCache) FetchAndCacheKeys(supabaseURL string) error {
	j.mu.Lock()
	defer j.mu.Unlock()

	// Check if cache is fresh (less than 1 hour old)
	if len(j.keys) > 0 && time.Since(j.cachedAt) < time.Hour {
		return nil
	}

	jwksURL := supabaseURL + "/auth/v1/.well-known/jwks.json"
	resp, err := http.Get(jwksURL)
	if err != nil {
		return fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("JWKS endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read JWKS response: %w", err)
	}

	var jwks jwksResponse
	if err := json.Unmarshal(body, &jwks); err != nil {
		return fmt.Errorf("failed to parse JWKS: %w", err)
	}

	j.keys = make(map[string]*ecdsa.PublicKey)

	for _, k := range jwks.Keys {
		if k.Kty != "EC" || k.Crv != "P-256" {
			continue // Skip non-ECDSA keys
		}

		pubKey, err := ecdsaPublicKeyFromJWK(k.X, k.Y)
		if err != nil {
			fmt.Printf("warning: failed to parse key %s: %v\n", k.Kid, err)
			continue
		}

		j.keys[k.Kid] = pubKey
	}

	j.cachedAt = time.Now()
	fmt.Printf("Loaded %d ECDSA keys from Supabase JWKS\n", len(j.keys))
	return nil
}

// GetKey retrieves a public key by kid.
func (j *JWKSCache) GetKey(kid string) *ecdsa.PublicKey {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.keys[kid]
}

// ecdsaPublicKeyFromJWK converts x and y coordinates to an ECDSA public key.
func ecdsaPublicKeyFromJWK(x, y string) (*ecdsa.PublicKey, error) {
	xBytes, err := base64.RawURLEncoding.DecodeString(x)
	if err != nil {
		return nil, fmt.Errorf("failed to decode x: %w", err)
	}

	yBytes, err := base64.RawURLEncoding.DecodeString(y)
	if err != nil {
		return nil, fmt.Errorf("failed to decode y: %w", err)
	}

	if len(xBytes) != 32 || len(yBytes) != 32 {
		return nil, fmt.Errorf("invalid coordinate lengths: x=%d, y=%d", len(xBytes), len(yBytes))
	}

	// Create raw public key bytes in uncompressed format for P-256
	pubKeyBytes := make([]byte, 1+len(xBytes)+len(yBytes))
	pubKeyBytes[0] = 0x04 // Uncompressed point format
	copy(pubKeyBytes[1:33], xBytes)
	copy(pubKeyBytes[33:65], yBytes)

	pubKey, err := x509.ParsePKIXPublicKey(pubKeyBytes)
	if err != nil {
		// Try direct elliptic curve parsing
		return parseECPublicKey(xBytes, yBytes)
	}

	ecdsaKey, ok := pubKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("public key is not ECDSA")
	}

	return ecdsaKey, nil
}

// parseECPublicKey creates an ECDSA public key from raw x,y coordinates for P-256.
func parseECPublicKey(x, y []byte) (*ecdsa.PublicKey, error) {
	pubKey := &ecdsa.PublicKey{
		Curve: elliptic.P256(),
	}

	// Initialize X and Y as big.Int and set bytes
	pubKey.X = new(big.Int).SetBytes(x)
	pubKey.Y = new(big.Int).SetBytes(y)

	return pubKey, nil
}
