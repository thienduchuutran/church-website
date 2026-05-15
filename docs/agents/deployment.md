# docs/agents/deployment.md - Hosting & Deployment Reference

## Architecture overview
```
GitHub (monorepo)
   │
   │ push to master
   │
   ├──────────────────────────┬───────────────────────────┐
   │                          │                           │
   ▼                          ▼                           ▼
Render auto-build       Vercel auto-build         (no third deploy target)
(Docker, Go binary)     (Next.js, edge-cached)
   │                          │
   ▼                          ▼
church-website-ff5w     church-website-neon
.onrender.com           .vercel.app
   │                          │
   │                          │ frontend calls /api/v1/* on the Render URL
   │ ◄────────────────────────┘ (cross-origin, CORS allows Vercel origin)
   │
   ├──→ Supabase Postgres   (session pooler, sslmode=require)
   └──→ Cloudflare R2       (S3-compatible, custom endpoint, static keys)

Auth layer: Supabase Auth (Google OAuth) → JWT → JWKS-verified by Go backend
```

There are no servers under our control. Every component is a managed service on a free or near-free tier. There is no Nginx, no systemd, no SSH, no SCP, no Elastic IP, no `.env` file on any server disk.

---

## Render (Go backend)

- **URL**: `https://church-website-ff5w.onrender.com`
- **Service type**: Web Service (Docker)
- **Repo**: `thienduchuutran/church-website`, branch `master`, root directory inferred from Dockerfile (project root)
- **Plan**: Free tier (spins down after 15 min of inactivity, cold start ~50 s)
- **Warm-keeper**: external HTTP ping every few minutes via `cron-job.org` hitting `/api/v1/health`. Without this, the first visitor after a quiet period waits for the cold start.

### How deploys work
1. Push to `master` on GitHub.
2. Render detects the push (it has a webhook from GitHub).
3. Render runs the Dockerfile build inside its own builder.
4. On success, Render swaps the container; on failure, the previous version keeps serving.
5. Visible in the Render dashboard → Events tab.

### Environment variables (Render dashboard → Environment)
Set via the Render dashboard, never in code. Mark anything with credentials as "Secret" so it's hidden in logs.

```
PORT                          (Render injects this automatically; do not set manually)
DATABASE_URL                  postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_URL                  https://<ref>.supabase.co
SUPABASE_JWT_SECRET           <Supabase JWT secret>            [Secret]
S3_BUCKET                     church-uploads-prod
S3_REGION                     auto
AWS_REGION                    auto
S3_ENDPOINT                   https://<r2-account-id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID             <R2 access key>                  [Secret]
AWS_SECRET_ACCESS_KEY         <R2 secret access key>           [Secret]
FRONTEND_ORIGIN               https://church-website-neon.vercel.app
DISCORD_WEBHOOK_EVENTS        https://discord.com/api/webhooks/...   [Secret]
DISCORD_WEBHOOK_ANNOUNCEMENTS https://...                            [Secret]
DISCORD_WEBHOOK_BIBLE_STUDIES https://...                            [Secret]
DISCORD_WEBHOOK_PLAYLISTS     https://...                            [Secret]
DISCORD_WEBHOOK_GALLERY       https://...                            [Secret]
DISCORD_WEBHOOK_USERNAME      Duc
DISCORD_WEBHOOK_AVATAR_URL    https://cdn.discordapp.com/avatars/...
```

> **`DATABASE_URL` uses single `%40` for the `@` in the password** (URL encoding). Render does not have systemd's specifier quirk - do not double the `%` here.

### Viewing logs / manual deploy
- **Logs**: Render dashboard → service → Logs tab. Streams in real time. Filterable by severity.
- **Manual redeploy**: dashboard → "Manual Deploy" button (top right) → "Deploy latest commit". Useful when you've changed env vars and want the new ones to take effect immediately (Render normally auto-redeploys on env var change anyway).
- **Rollback**: Events tab → click a previous green deploy → "Rollback to this deploy".

---

## Vercel (Next.js frontend)

- **URL**: `https://church-website-neon.vercel.app`
- **Project type**: Auto-detected Next.js
- **Repo**: `thienduchuutran/church-website`, branch `master`, **Root Directory = `frontend`**
- **Plan**: Free (Hobby) tier

### How deploys work
1. Push to `master` on GitHub.
2. Vercel detects the push and starts a build inside its own infrastructure.
3. Build runs `npm install` (reads `frontend/.npmrc` which sets `legacy-peer-deps=true`) then `next build`.
4. On success, the new build is promoted to production at the Vercel URL.
5. Every other branch / PR also gets its own preview URL automatically.

### Environment variables (Vercel dashboard → Settings → Environment Variables)
```
NEXT_PUBLIC_SUPABASE_URL       https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  <anon key>                  (safe to expose - RLS enforces)
NEXT_PUBLIC_API_URL            https://church-website-ff5w.onrender.com
```

The frontend uses `NEXT_PUBLIC_API_URL` to build all `/api/v1/...` request URLs - it is the single switch that points the frontend at the backend. Changing it requires a redeploy.

### `frontend/.npmrc`
```
legacy-peer-deps=true
```
This file exists because some libraries (notably `@emoji-mart/react`) have not updated their peer-dep declarations for React 19. Without it, `npm install` fails with `ERESOLVE`.

---

## Supabase (database + auth)

- **Project ref**: `glcnqlffktqxaizdverk`
- **Region**: `aws-us-east-1`
- **Connection from Render**: session pooler at `aws-1-us-east-1.pooler.supabase.com:5432`, NOT the direct connection (which is IPv6-only and unreachable from many platforms).
- **Auth**: Supabase Auth handles Google OAuth, issues ES256-signed JWTs verified by the Go backend via JWKS. See `docs/agents/auth.md`.
- **Storage**: not used. Files live in R2, not Supabase Storage.

### Supabase Auth URL Configuration
Authentication → URL Configuration must contain the frontend URL so OAuth redirects work:
- **Site URL**: `https://church-website-neon.vercel.app`
- **Redirect URLs**: same value (or include any custom domain too)

---

## Cloudflare R2 (file storage)

- **Bucket**: `church-uploads-prod`
- **Endpoint**: `https://<account-id>.r2.cloudflarestorage.com` (set as `S3_ENDPOINT` on Render)
- **Auth**: static access key + secret stored in Render env (R2 has no IAM roles)
- **Path style**: required - the Go code sets `o.UsePathStyle = true` when `S3_ENDPOINT` is non-empty. R2 does not honor virtual-hosted-style URLs.

### How the Go backend talks to R2
The `aws-sdk-go-v2` library accepts a custom `BaseEndpoint`. See `backend/internal/storage/s3.go` - when `endpoint != ""`, the client is configured for R2; when empty, it falls back to default AWS S3 resolution. The same upload/download/presign code paths work against either.

---

## CI/CD - GitHub Actions (legacy, can be removed)

`.github/workflows/deploy.yml` exists from the pre-migration era when artifacts were SCP'd to EC2. It still triggers on push but is effectively a no-op now - **Render and Vercel handle deploys independently via their own GitHub integrations**. The workflow can be deleted at convenience; leaving it does no harm but adds noise to GitHub Actions runs.

---

## Local development

Local dev does not touch Render or Vercel - it runs the apps directly on your laptop.

### Backend (Go)
```bash
cd backend
go run ./cmd/server
```
Reads `backend/.env` via `godotenv`. Connects to whatever `DATABASE_URL` you have there (typically the local Docker Postgres on port 5433, see repo-root `docker-compose.yml`).

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Reads `frontend/.env.local`. `NEXT_PUBLIC_API_URL=http://localhost:8080` points the dev frontend at your local Go backend.

### Local DB
```bash
docker compose up -d
```
Starts the local Postgres at `localhost:5433`. The seed schema can be applied with `psql "$DATABASE_URL" -f scripts/rds-schema.sql` (the filename is historical - it's standard plain-Postgres SQL).

---

## Custom domain (optional)

Currently the canonical URL is `church-website-neon.vercel.app`. To use a custom domain like `vgomne.ddns.net`:

1. **DNS** (in No-IP or whatever DDNS hosts the name): set the A record to Vercel's anycast IP `76.76.21.21`.
2. **Vercel**: Project Settings → Domains → Add `vgomne.ddns.net`. Vercel verifies via DNS and issues a Let's Encrypt cert.
3. **CORS**: update Render's `FRONTEND_ORIGIN` env var to the new origin.
4. **Supabase Auth URL Configuration**: add the new origin to Site URL + Redirect URLs.
5. **Optional, slicker**: add `frontend/vercel.json` with a rewrite that proxies `/api/*` to Render. Then change Vercel's `NEXT_PUBLIC_API_URL` to the custom domain itself. Result: API calls look same-origin from the browser, no CORS needed.

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://church-website-ff5w.onrender.com/api/:path*" }
  ]
}
```

---

## Cost summary

| Service | Plan | Monthly cost |
|---|---|---|
| Render (Go backend) | Free | $0 |
| Vercel (Next.js frontend) | Hobby | $0 |
| Supabase (Postgres + Auth) | Free | $0 |
| Cloudflare R2 (storage) | Free tier (under 10 GB) | $0 |
| cron-job.org (keep-warm) | Free | $0 |
| GitHub (repo + Actions) | Free | $0 |
| **Total** | | **$0/month** |
