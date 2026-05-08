# Church Website

Public-facing website for a Christian & Missionary Alliance church (~100 members).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (React 19, TypeScript) |
| Backend | Go 1.25 (chi v5) |
| Database | PostgreSQL 16 on Amazon RDS |
| Auth | Supabase Auth (Google OAuth) |
| Storage | AWS S3 |
| Styling | Tailwind CSS v4 |
| Hosting | AWS EC2 (both frontend and backend) |
| CI/CD | GitHub Actions → SCP deploy → systemd |
| Local dev DB | Docker Compose (PostgreSQL 16-alpine) |
| Migrations | golang-migrate v4 (embedded SQL, auto-run on startup) |

## Getting started

### Prerequisites
- Node.js 18+
- Go 1.25+
- Docker (for local Postgres)

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
cp .env.example .env               # fill in DB, Supabase JWT secret, S3, Discord
docker compose up -d               # start local Postgres
go mod tidy
go run ./cmd/server
```

## Project docs
- [Database schema](docs/agents/database.md)
- [Backend architecture](docs/agents/backend.md)
- [Frontend architecture](docs/agents/frontend.md)
- [Auth flow](docs/agents/auth.md)
- [Discord webhooks](docs/agents/discord.md)
- [Deployment](docs/agents/deployment.md)
