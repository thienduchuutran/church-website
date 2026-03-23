# Church Website

Public-facing website for a Christian & Missionary Alliance church (~100 members).

## Stack
- **Frontend**: Next.js → Vercel
- **Backend**: Go (chi) → Fly.io
- **Database / Auth / Storage**: Supabase

## Getting started

### Prerequisites
- Node.js 18+
- Go 1.22+
- A Supabase project (see `docs/agents/database.md`)

### Frontend
```bash
cd frontend
cp .env.local.example .env.local   # fill in your Supabase keys
npm install
npm run dev
```

### Backend
```bash
cd backend
cp .env.example .env               # fill in your keys
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
