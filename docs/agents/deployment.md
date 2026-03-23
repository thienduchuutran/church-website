# docs/agents/deployment.md — Hosting & Deployment Reference

## Architecture overview
```
GitHub (monorepo)
├── frontend/ → Vercel (auto-deploys on push to main)
└── backend/  → Fly.io (deploy via flyctl or GitHub Action)
```

---

## Frontend: Vercel

**Setup (one time):**
1. Push repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub → select `church-website`
3. Set root directory to `frontend`
4. Vercel auto-detects Next.js — no build config needed
5. Add environment variables in Vercel dashboard (Settings → Environment Variables):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_API_URL        ← set to your Fly.io backend URL after deploying backend
   ```

**After setup:** every `git push` to `main` triggers an automatic Vercel deployment. Preview deployments are created for every PR automatically.

---

## Backend: Fly.io

**Install flyctl (one time):**
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

**Initialize (one time, run from `backend/` folder):**
```bash
cd backend
fly launch
# follow prompts: app name, region (choose closest to US East), no Postgres (using Supabase)
# this creates fly.toml in backend/
```

**Set secrets on Fly.io (never commit these):**
```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set SUPABASE_JWT_SECRET="..."
fly secrets set DISCORD_WEBHOOK_EVENTS="https://discord.com/api/webhooks/..."
fly secrets set DISCORD_WEBHOOK_ANNOUNCEMENTS="https://..."
fly secrets set DISCORD_WEBHOOK_BIBLE_STUDIES="https://..."
fly secrets set DISCORD_WEBHOOK_PLAYLISTS="https://..."
fly secrets set DISCORD_WEBHOOK_GALLERY="https://..."
fly secrets set FRONTEND_ORIGIN="https://your-site.vercel.app"
```

**Deploy:**
```bash
cd backend
fly deploy
```

**View logs:**
```bash
fly logs
```

---

## Dockerfile (`backend/Dockerfile`)
Go compiles to a single static binary — the Docker image is tiny (~15MB).

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
```

---

## Environment variables: where each one lives

| Variable | Frontend `.env.local` | Backend `.env` | Vercel dashboard | Fly.io secrets |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | | ✅ | |
| `NEXT_PUBLIC_API_URL` | ✅ | | ✅ | |
| `DATABASE_URL` | | ✅ | | ✅ |
| `SUPABASE_JWT_SECRET` | | ✅ | | ✅ |
| `DISCORD_WEBHOOK_*` (all 5) | | ✅ | | ✅ |
| `FRONTEND_ORIGIN` | | ✅ | | ✅ |
| `PORT` | | ✅ (8080) | | auto-set by Fly |

---

## .gitignore (root level)
```
# Environment files — never commit
.env
.env.local
.env.*.local
*.txt   ← covers the secret keys .txt file in your root

# Dependencies
node_modules/
frontend/.next/

# Go build output
backend/server
backend/tmp/

# OS files
.DS_Store
Thumbs.db
```

---

## Keep-alive for Fly.io free tier
If using Fly.io's free tier, the app may sleep after inactivity.
Set up a free cron job at cron-job.org to ping `https://your-app.fly.dev/health` every 10 minutes.
Add a health check route in Go:
```go
r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ok"))
})
```

---

## Supabase: no deployment needed
Supabase is a managed service. Schema changes are applied via SQL editor in the dashboard,
or via migration files in `backend/db/migrations/` run manually.
Production URL and keys are in Supabase dashboard → Project Settings → API.
