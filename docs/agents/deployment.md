# docs/agents/deployment.md - Hosting & Deployment Reference

## Architecture overview
```
GitHub (monorepo) → GitHub Actions CI/CD
                          │
                    push to master
                          │
              ┌───────────▼───────────┐
              │  GitHub-hosted runner  │
              │  - go build (linux)    │
              │  - npm run build       │
              └───────────┬───────────┘
                          │  SCP artifacts
                          ▼
              ┌─────────────────────────┐
              │   EC2 (us-east-1)       │
              │   Ubuntu, Elastic IP    │
              │   vgomne.ddns.net       │
              │                         │
              │  Nginx (port 443/80)    │
              │    /api/* → :8080       │
              │    /*     → :3000       │
              │                         │
              │  church-backend.service │  ← Go binary
              │  church-frontend.service│  ← Next.js
              └─────────────────────────┘
```

---

## EC2 instance

- **Region**: us-east-1 (Northern Virginia)
- **Domain**: `vgomne.ddns.net` (DDNS - points at the Elastic IP)
- **Elastic IP**: static, survives stop/restart
- **Security Group inbound rules**:
  | Port | Source | Purpose |
  |------|--------|---------|
  | 22 (SSH) | your IP only | Admin SSH access |
  | 80 (HTTP) | 0.0.0.0/0 | Certbot HTTP challenge + redirect |
  | 443 (HTTPS) | 0.0.0.0/0 | Public web traffic |

- **SSH access**: `ssh -i <key.pem> ubuntu@<elastic-ip>`

---

## Nginx (`/etc/nginx/sites-available/church-website`)

Nginx sits in front of both apps and handles SSL termination.

```nginx
server {
    listen 443 ssl;
    server_name vgomne.ddns.net;

    ssl_certificate     /etc/letsencrypt/live/vgomne.ddns.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vgomne.ddns.net/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name vgomne.ddns.net;
    return 301 https://$host$request_uri;
}
```

Reload after config changes: `sudo nginx -t && sudo systemctl reload nginx`

---

## systemd services

Both apps are registered as system services - they auto-start on boot and restart on crash.

### Go backend (`/etc/systemd/system/church-backend.service`)
```ini
[Unit]
Description=Church Website Go Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/church-website/backend
ExecStart=/home/ubuntu/church-website/backend/server
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=DATABASE_URL=postgresql://postgres:<password>@<rds-endpoint>:5432/postgres
Environment=SUPABASE_URL=https://your-project-id.supabase.co
Environment=DISCORD_WEBHOOK_EVENTS=https://...
Environment=DISCORD_WEBHOOK_ANNOUNCEMENTS=https://...
Environment=DISCORD_WEBHOOK_BIBLE_STUDIES=https://...
Environment=DISCORD_WEBHOOK_PLAYLISTS=https://...
Environment=DISCORD_WEBHOOK_GALLERY=https://...
Environment=FRONTEND_ORIGIN=https://vgomne.ddns.net
Environment=AWS_REGION=us-east-1
Environment=S3_BUCKET=church-uploads-prod-058264284549-us-east-1-an

[Install]
WantedBy=multi-user.target
```

### Next.js frontend (`/etc/systemd/system/church-frontend.service`)
```ini
[Unit]
Description=Church Website Next.js Frontend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/church-website/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
Environment=NEXT_PUBLIC_SUPABASE_ANON_KEY=...
Environment=NEXT_PUBLIC_API_URL=https://vgomne.ddns.net

[Install]
WantedBy=multi-user.target
```

> **All secrets live in the systemd service files, not in `.env` files on disk.**
> Edit with: `sudo systemctl edit --full church-backend` then `sudo systemctl daemon-reload && sudo systemctl restart church-backend`

---

## SSL/HTTPS - Let's Encrypt (Certbot)

Certificates are obtained and auto-renewed via Certbot.
```bash
sudo certbot --nginx -d vgomne.ddns.net
```
Auto-renewal is handled by a systemd timer (`certbot.timer`). Certificates last 90 days.

---

## CI/CD - GitHub Actions

**Workflow file**: `.github/workflows/deploy.yml`

**What it does on every push to `master`:**
1. Cross-compiles Go binary for Linux (`GOOS=linux GOARCH=amd64`)
2. Builds Next.js production bundle with env vars injected at build time
3. SCPs compiled Go binary to EC2
4. SCPs Next.js `.next/` build output to EC2
5. SSHs into EC2 and restarts both systemd services
6. Confirms both services are active

**GitHub Secrets required** (Settings → Secrets → Actions):
| Secret | Value |
|--------|-------|
| `EC2_HOST` | Elastic IP address |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Private key PEM content |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | `https://vgomne.ddns.net` |

> **Why cross-compile on the runner?** Building on EC2 (especially Next.js) freezes a 1GB RAM instance due to OOM. The GitHub runner has 7GB RAM and compiles cleanly; only the finished artifacts are copied to the server.

---

## Viewing logs

```bash
# Go backend logs
sudo journalctl -u church-backend -f

# Next.js frontend logs
sudo journalctl -u church-frontend -f

# Nginx access/error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Manual deploy (without CI/CD)

```bash
# Build Go binary locally (macOS/Windows cross-compile for Linux)
cd backend
GOOS=linux GOARCH=amd64 go build -o server ./cmd/server

# SCP to EC2
scp -i <key.pem> server ubuntu@<elastic-ip>:/home/ubuntu/church-website/backend/

# SSH in and restart
ssh -i <key.pem> ubuntu@<elastic-ip>
sudo systemctl restart church-backend
sudo systemctl status church-backend
```

---

## Environment variables - where each one lives

| Variable | Frontend systemd env | Backend systemd env | GitHub Secret (build-time) |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | | ✅ |
| `NEXT_PUBLIC_API_URL` | ✅ | | ✅ |
| `DATABASE_URL` | | ✅ | | RDS endpoint - private, only reachable from EC2 |
| `SUPABASE_URL` | | ✅ | | Used only for JWKS key fetch (auth), not DB |
| `DISCORD_WEBHOOK_*` (all 5) | | ✅ | |
| `FRONTEND_ORIGIN` | | ✅ | |
| `PORT` | ✅ (3000) | ✅ (8080) | |
| `AWS_REGION` | | ✅ | |
| `S3_BUCKET` | | ✅ | |

---

## Swap space (OOM fix)

EC2 has 1GB RAM. Next.js TypeScript compilation exceeds this and OOM-kills the process.
Swap space is provisioned on the EC2 disk as virtual memory overflow.

```bash
# Check current swap
free -h

# Add 2GB swap if not present
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make permanent:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
