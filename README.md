# Church Website

Public-facing website for a Christian & Missionary Alliance church (~100 members).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (React 19, TypeScript) on Vercel |
| Backend | Go 1.25 (chi v5) on Render (Docker) |
| Database | Supabase Postgres (session pooler, sslmode=require) |
| Auth | Supabase Auth (Google OAuth, ES256 JWT verified via JWKS) |
| Storage | Cloudflare R2 (S3-compatible API) |
| Styling | Tailwind CSS v4 |
| CI/CD | Render and Vercel auto-deploy on push to `master` |
| Local dev DB | Docker Compose (PostgreSQL 16-alpine on port 5433) |
| Migrations | golang-migrate v4 - SQL files in `backend/migrations/` are embedded into the Go binary and applied automatically on backend startup |

## Getting started

### Prerequisites
- Node.js 18+
- Go 1.25+
- Docker (for local Postgres via the repo's `docker-compose.yml`)

### Frontend
```bash
cd frontend
cp .env.local.example .env.local   # fill in Supabase + API URL
npm install
npm run dev
```

### Backend
```bash
cd backend
cp .env.example .env               # fill in DATABASE_URL, Supabase JWT secret, R2, Discord
docker compose up -d               # start local Postgres on localhost:5433
go mod tidy
go run ./cmd/server                # runs migrations on boot, then serves on :8080
```
The backend's `runMigrations` function in `cmd/server/main.go` runs all pending up-migrations from `backend/migrations/` against `DATABASE_URL` before the HTTP server starts. No manual migration step is needed.

## Project docs
- [Database schema](docs/agents/database.md)
- [Backend architecture](docs/agents/backend.md)
- [Frontend architecture](docs/agents/frontend.md)
- [Auth flow](docs/agents/auth.md)
- [Discord webhooks](docs/agents/discord.md)
- [Deployment](docs/agents/deployment.md)
