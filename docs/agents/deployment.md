# docs/agents/deployment.md — Hosting & Deployment Reference

## Architecture overview
```
GitHub (monorepo)
├── frontend/ → Vercel (auto-deploys on push to main)
└── backend/  → Render (auto-deploys on push to main via GitHub connection)
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
   NEXT_PUBLIC_API_URL        ← set to your Render backend URL after deploying backend (e.g. https://your-app.onrender.com)
   ```

**After setup:** every `git push` to `main` triggers an automatic Vercel deployment. Preview deployments are created for every PR automatically.

---

## Backend: Render

Render free tier: 750 hours/month, no credit card required. The service sleeps after 15 minutes of inactivity — Go cold starts are fast (under 1 second) so this is acceptable. No CLI needed; everything is configured through the Render dashboard and GitHub integration.

**Setup (one time):**
1. Go to [render.com](https://render.com) → sign up (or log in)
2. Click **New +** → **Web Service**
3. Connect your GitHub account → select the `church-website` repository
4. Configure the service:
   - **Name**: `church-website-api` (or whatever you like)
   - **Region**: Oregon (US West) or Ohio (US East) — pick closest to your users
   - **Root Directory**: `backend`
   - **Runtime**: Docker (Render auto-detects the Dockerfile in `backend/`)
   - **Instance Type**: Free
5. Click **Create Web Service**

**Set environment variables (Render dashboard → your service → Environment tab):**
```
DATABASE_URL=postgresql://...
SUPABASE_JWT_SECRET=...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
DISCORD_WEBHOOK_EVENTS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://...
DISCORD_WEBHOOK_BIBLE_STUDIES=https://...
DISCORD_WEBHOOK_PLAYLISTS=https://...
DISCORD_WEBHOOK_GALLERY=https://...
FRONTEND_ORIGIN=https://your-site.vercel.app
PORT=8080
```

**After setup:** every `git push` to `main` triggers an automatic Render deployment. You can also trigger manual deploys from the dashboard.

**View logs:** Render dashboard → your service → **Logs** tab.

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

| Variable | Frontend `.env.local` | Backend `.env` | Vercel dashboard | Render Environment tab |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | | ✅ | |
| `NEXT_PUBLIC_API_URL` | ✅ | | ✅ | |
| `DATABASE_URL` | | ✅ | | ✅ |
| `SUPABASE_JWT_SECRET` | | ✅ | | ✅ |
| `SUPABASE_URL` | | ✅ | | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | | ✅ | | ✅ |
| `DISCORD_WEBHOOK_*` (all 5) | | ✅ | | ✅ |
| `FRONTEND_ORIGIN` | | ✅ | | ✅ |
| `PORT` | | ✅ (8080) | | ✅ (8080) |

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

## Keep-alive for Render free tier
Render free tier sleeps the service after 15 minutes of inactivity. To minimize cold starts for real users, set up a free cron job at [cron-job.org](https://cron-job.org) to ping `https://your-app.onrender.com/api/v1/health` every 14 minutes.

The health check route already exists in the codebase at `backend/internal/handler/health.go`, mounted at `GET /api/v1/health`.

---

## Supabase: no deployment needed
Supabase is a managed service. Schema changes are applied via SQL editor in the dashboard,
or via migration files in `backend/db/migrations/` run manually.
Production URL and keys are in Supabase dashboard → Project Settings → API.
