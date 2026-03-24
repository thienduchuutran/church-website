## Backend setup scratchpad

Goal: make `backend/` fully bootstrapped so it compiles, runs, and has dependency management in place.

### Files to add/update

1. `backend/internal/handler/health_test.go`
   - Add tests first (TDD) for health endpoint response contract.
2. `backend/internal/handler/health.go`
   - Implement health handler used by the API router.
3. `backend/internal/middleware/cors.go`
   - Add explicit CORS middleware with env-configured frontend origin.
4. `backend/internal/middleware/cors_test.go`
   - Add unit test for CORS headers.
5. `backend/cmd/server/main.go`
   - Wire env loading, optional DB pool init, chi router, middleware, and routes.

### Command steps

1. Run `go mod tidy` in `backend/` to resolve and lock dependencies.
2. Run `go test ./...` to verify setup.

### Side effects / risks

- Server startup now validates environment at runtime and may skip DB wiring when `DATABASE_URL` is missing in local dev.
- CORS behavior is strict to configured origin unless wildcard is set.

---

## Environment bootstrap scratchpad

Goal: provide ready-to-edit local env files for frontend, backend, and database connection placeholders.

### Files to add/update

1. `.gitignore`
   - Add environment ignore patterns to prevent local secrets from being committed.
2. `backend/.env`
   - Add placeholder backend runtime variables, including database URL and Discord webhooks.
3. `frontend/.env.local`
   - Add placeholder frontend public runtime variables.

### Order of changes

1. Update ignore rules first.
2. Add backend env template values with empty placeholders.
3. Add frontend env template values with empty placeholders.

### Side effects / risks

- New local env files are intentionally not committed after ignore rules are in place.
- Backend may still run in degraded mode if required values are left empty.
