# progress.md — System Growth & Resume Notes

## Project Context
church-website: a Next.js frontend + Go backend + Supabase data/auth/storage app for church management.

## 2026-03-28 - JWT middleware migration (ES256 / Supabase JWKS)
1. Problem discovered:
   - Token header in requests contains `alg: ES256`, `kid: <uuid>`.
   - Middleware was validating with `[]byte(SUPABASE_JWT_SECRET)` from .env (HMAC flow), causing `ECDSA verify expects *ecdsa.PublicKey`.
2. Root cause:
   - Supabase currently issues ECDSA tokens (signed by private key), while code used symmetric key path.
3. Solution implemented:
   - Added `SUPABASE_URL` to `.env` to locate JWKS URL.
   - Added `internal/middleware/jwks.go`:
     - Fetch public keys from `.../.well-known/jwks.json`
     - Parse JWK ECC `x/y` coordinates to `*ecdsa.PublicKey`
     - Cache keys for performance and key rotation safety.
   - Updated `internal/middleware/auth.go`:
     - Require `ES256` algorithm in signer callback.
     - Read `kid` from token header and resolve key by `jwksCache.GetKey()`.
     - Enforce token validity + email claim + admin table check.
   - Updated `cmd/server/main.go`:
     - Initialize JWKS cache on startup.
     - Fail fast if JWKS fetch fails.
     - Pass cache into RequireAdmin.
4. Test result:
   - Backend now starts and prints `Loaded 1 ECDSA keys from Supabase JWKS`.
   - `curl` against /api/v1/posts (with valid auth) should now pass signature check.

## Architecture notes (resume bullets)
- Designed and shipped secure JWT verification for Supabase in Go using JWKS and ECDSA.
- Built middleware with proper separation: token extraction, auth validation, role lookup.
- Implemented project-wide consistency in docs and architectural reference.

## Metrics and impact (to track)
- `jwt_validation_success_rate` (goal: 99.9%)
- `admin_auth_error_rate` (reduce invalid key errors to 0)
- Key refresh cadence: 1h (JWKS cache TTL)

## Next improvements
- Add automated tests for `RequireAdmin` with live mocked JWKS server.
- Add health endpoint for JWKS status.
- Add telemetry for token issuer/kid success/failure.
