# docs/history/aws-migration-retrospective.md - The AWS Era, As Built

Reconstructed 2026-08-29 entirely from this repository's git history. Every claim
cites the commit it comes from. Where the repo has no evidence, the section says
"not found in repo history" - nothing below is filled in from general AWS knowledge.

Method notes: evidence was gathered from `git log --all` (commit messages),
`git log -G/-S` (pickaxe: commits whose diff content touched a string, which finds
content even in files later deleted), full-history file tracing on the four infra
files that ever existed, `git fsck --unreachable` + reflog (dangling commits), and
the GitHub API for PR descriptions. Only four infra-shaped files ever existed in
any commit: `.github/workflows/deploy.yml`, `backend/Dockerfile`,
`docker-compose.yml`, `docs/agents/deployment.md`. No nginx conf, `.service` unit,
certbot script, Terraform/CDK/CloudFormation file was ever a tracked file - the
Nginx and systemd configs below survive only because they were pasted verbatim
into `docs/agents/deployment.md` during the AWS era.

---

## Timeline

The AWS era is a 22-day detour in the middle of the project. The site began on
managed platforms, moved to AWS, and moved back.

| Date | Commit | What happened |
|---|---|---|
| 2026-03-23 | `1cd8887` | Init. README stack: "Frontend: Next.js -> Vercel; Backend: Go (chi) -> Fly.io; Database/Auth/Storage: Supabase". `docs/agents/deployment.md` created. |
| 2026-03-30 | `635bb32` | "setting up for first deployment" - deployment.md documents Vercel (frontend) + Render free tier via Docker (backend) + Supabase. Note the docs disagree: README said Fly.io until 2026-05-08 (`b6ace1b`), deployment.md said Render. Which one actually served pre-AWS traffic is not provable from the repo. |
| 2026-04-03 | `0e08e8c` | "fixed supabase pgbouncer transaction pooler" - pre-AWS prod DB was Supabase behind PgBouncer (port 6543, transaction mode). |
| **2026-04-22** | **`a5da607`** | **First AWS commit**: "connecting Go backend to S3 on EC2". Adds `aws-sdk-go-v2` to go.mod and `backend/internal/storage/s3.go` using EC2 IAM-role credentials. |
| 2026-04-23 | `521518f` | Posting interfaces renamed for the S3 migration. |
| 2026-04-24 | `2e14d85` | "first Github CI/CD workflows" - `.github/workflows/deploy.yml` ("Deploy to EC2") created. Same-day fixes: `d84155d` (main.go path), `ff45f2b` (env var access), `631f0a2` (inject NEXT_PUBLIC_API_URL at build), `89649ae` (binary named `server` to match systemd ExecStart), `1ef1714` (`--legacy-peer-deps` in the EC2-side `npm ci`). |
| 2026-04-24 | `51df601` | deployment.md rewritten from Render/Vercel to the full EC2 + Nginx + systemd + Certbot document (source of the verbatim configs below). |
| 2026-04-24 | `83dba42` | AGENTS.md updated "to reflect the latest AWS infra": names the RDS instance (`church-db`, db.t4g.micro), the S3 bucket, the security-group pair. |
| 2026-04-24 | `77afcc2` | `scripts/rds-schema.sql` + `scripts/migrate-data.sh` added (Supabase -> RDS data move). `4c2acab` drops the FK on `reactions.post_id`. `020595f` removes the Supabase PgBouncer SimpleProtocol workaround from the pgx pool ("RDS is a direct Postgres connection - prepared statements are fully supported"). `1a3a20c` moves the admin check off direct Supabase queries onto the backend API. |
| 2026-04-27 | `07fa0b6` | All frontend reads rewired from direct Supabase queries to the Go API backed by "RDS on EC2" (415 insertions across 18 files). |
| 2026-04-30 | `5b790a8` / `4624a28` | `docker-compose.yml` added - local dev Postgres 16-alpine seeded with `rds-schema.sql`. Local dev only; Docker was never part of the EC2 runtime. |
| 2026-05-05/06 | `0626615`, `c944753`, `677f7e0` | Hero-video upload service on S3 (atomicity + validation of content type, size, S3 key); golang-migrate begins running embedded migrations on startup. |
| 2026-05-08 | `b6ace1b` | README updated to the as-built AWS stack: "PostgreSQL 16 on Amazon RDS", "AWS S3", "AWS EC2 (both frontend and backend)", "GitHub Actions -> SCP deploy -> systemd". |
| 2026-05-10 | `578e153` | Last AWS-era change to deploy.yml (`--legacy-peer-deps` on the runner build). This is still the file at HEAD today. |
| **2026-05-14** | **`5e02643`** | **Exit begins**: "migrated from s3 connection to r2 connection" - `NewS3Client` gains an `endpoint` parameter (R2 uses `BaseEndpoint` + path-style addressing). |
| 2026-05-15 | `1a4fa42` | "updated docs as infra changed" - deployment.md rewritten to the current Render + Vercel + Supabase (session pooler) + R2 architecture. `624ce0b` (same day) coins "the RDS detour" in AGENTS.md and documents the golang-migrate flow. |
| 2026-05-16 | `3851cd6` | `R2_PUBLIC_URL` support - fully in the R2 world. |

**Bounds: `a5da607` (2026-04-22) to `5e02643` (2026-05-14); docs teardown complete `624ce0b` (2026-05-15).**

Branches, tags, dangling commits: no AWS-specific branch ever existed (all ten
feature branches are app features), the repo has zero tags, and every unreachable
commit from `git fsck` is June-August 2026 calendar work (stash entries and
`fixup!` commits). The migration-away commits landed directly on master and were
not squashed - no teardown detail was lost to history rewriting.

---

## Compute

**EC2 instance** (from deployment.md as written at `51df601`, and AGENTS.md at `83dba42`):

- Region: us-east-1 (Northern Virginia)
- OS: Ubuntu (version never recorded), login user `ubuntu`, app dir `/home/ubuntu/church-website`
- RAM: 1 GB, stated twice ("Building on EC2 (especially Next.js) freezes a 1GB RAM instance due to OOM"; "EC2 has 1GB RAM. Next.js TypeScript compilation exceeds this and OOM-kills the process")
- Instance type: **not found in repo history** (1 GB RAM is stated; the type name never is)
- AMI: not found in repo history
- Elastic IP: yes - "static, survives stop/restart"
- Domain: `vgomne.ddns.net` via dynamic DNS pointed at the Elastic IP (DDNS provider not named in the repo)
- SSH: `ssh -i <key.pem> ubuntu@<elastic-ip>`
- A 2 GB swapfile procedure is documented as the OOM mitigation (`fallocate -l 2G /swapfile` ... `/etc/fstab`); whether it was actually applied on the box is not verifiable from the repo.

Both apps ran on this one instance. No Docker on EC2 - the Go binary and `npm start`
ran directly under systemd. (`backend/Dockerfile` existed from init for Render's
Docker runtime and stayed unused during the AWS era.)

**Nginx as reverse proxy** - config preserved verbatim in deployment.md
(`/etc/nginx/sites-available/church-website`), SSL termination plus path routing:

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

**systemd** kept both processes alive - both unit files preserved verbatim.
Backend (`/etc/systemd/system/church-backend.service`):

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

Frontend (`/etc/systemd/system/church-frontend.service`):

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

Doc's stated secret policy: "All secrets live in the systemd service files, not in
`.env` files on disk", edited via `sudo systemctl edit --full church-backend`.

**TLS**: Let's Encrypt via Certbot - `sudo certbot --nginx -d vgomne.ddns.net`,
auto-renewal via the `certbot.timer` systemd timer, 90-day certificates. No
certbot bootstrap script was ever committed; only these commands in the doc.

---

## Database

- Engine: **PostgreSQL 16 on Amazon RDS** (README table, `b6ace1b`, 2026-05-08). Minor version, storage size, backup/Multi-AZ/parameter-group settings: not found in repo history.
- Instance: identifier `church-db`, class **db.t4g.micro**, us-east-1 (AGENTS.md, `83dba42`).
- Reachability: "RDS and EC2 talk privately over port 5432 via auto-created security groups (`rds-ec2-1` on RDS, `ec2-rds-1` on EC2)" (`83dba42`); deployment.md env table: "RDS endpoint - private, only reachable from EC2".
- Connection string pattern (from the systemd unit): `postgresql://postgres:<password>@<rds-endpoint>:5432/postgres`. The real RDS hostname was never committed - every occurrence is a `<rds-endpoint>` placeholder.
- Client/pooling: `pgx/v5` `pgxpool` (`backend/pkg/database/postgres.go`). Commit `020595f` removed `QueryExecModeSimpleProtocol` because it "was only needed for Supabase's PgBouncer on port 6543 and has no place in an RDS setup" - so the RDS era ran direct Postgres with prepared statements and pgxpool defaults (no explicit pool sizing in the repo).
- Schema: `scripts/rds-schema.sql` (`77afcc2`) - "plain Postgres, no Supabase-specific syntax. No RLS, no auth.users references, no PgBouncer workarounds." Uses `gen_random_uuid()`; `posts.admin_id` stores the Supabase JWT `sub` claim with deliberately no FK "since auth.users lives in Supabase, not here."
- Data migration: `scripts/migrate-data.sh` (`77afcc2`) - apply schema to RDS with psql, `pg_dump --data-only --disable-triggers` five tables from Supabase (`admins`, `posts`, `post_images`, `reactions`, `page_content`), restore with `ON_ERROR_STOP`, then verify source/destination row counts per table, then update `DATABASE_URL` in the systemd unit. Both scripts still exist at HEAD.
- App wiring: `07fa0b6` (2026-04-27) removed the frontend's remaining direct Supabase reads; from then on every page fetched through the Go API against RDS. Auth stayed on Supabase the whole time (Google OAuth + ES256 JWT verified via JWKS) - only the JWKS key fetch used `SUPABASE_URL`, not the DB.
- From `677f7e0` (2026-05-06), golang-migrate v4 applied embedded migrations on backend startup - this began against RDS and survived the move back.

---

## Storage (S3)

- Bucket: **`church-uploads-prod-058264284549-us-east-1-an`**, us-east-1 (`83dba42`; also in the systemd unit as `S3_BUCKET`). The embedded 12-digit number matches the AWS account-ID naming convention. Naming reads as `church-uploads-prod-<account-id>-<region>-<suffix>`; the repo never explains the `-an` suffix.
- Access: "S3 bucket is fully private (no public access); access is controlled by IAM policies" (`83dba42`). Credentials via the EC2 instance role - the Go client comment reads "Automatically uses the EC2 IAM role - no keys needed" (`a5da607`).
- Client: `aws-sdk-go-v2` (`config.LoadDefaultConfig` + `s3.NewFromConfig`), three operations: `PutObject` (uploads through the backend, never browser-direct), `DeleteObject` (cleanup when a DB write fails, keeping upload+insert atomic), and `PresignGetObject` (reads returned presigned URLs; the DB stores only the key).
- What got uploaded, with key structure:
  - Post/gallery images (`18ce243`, `3c1cf57`): `images/posts/{postID}/{unixNano}{ext}`
  - Hero background video (`0626615`): `videos/hero/{unixNano}{ext}`, with validation of content type, upload size, S3 key, and response shape (`c944753`)
- The R2 exit (`5e02643`) kept this exact code and added `endpoint`/`UsePathStyle`; post-migration the same interface talks to `https://<account>.r2.cloudflarestorage.com` with static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env keys instead of an instance role, and the bucket became plain `church-uploads-prod` (`1a4fa42`).

---

## IAM

**No IAM policy JSON, role definition, or role name was ever committed.** A pickaxe
search across all history for `"Effect"`, `iam:`, and policy-shaped strings matches
only the two prose mentions already quoted: the AGENTS.md line "access is
controlled by IAM policies" (`83dba42`) and the s3.go comment "Automatically uses
the EC2 IAM role - no keys needed" (`a5da607`). What the role was named and exactly
which S3 actions it granted: not found in repo history.

---

## Networking

Explicit in the repo:

- Security group inbound rules for the EC2 instance (deployment.md, `51df601`):

  | Port | Source | Purpose |
  |------|--------|---------|
  | 22 (SSH) | your IP only | Admin SSH access |
  | 80 (HTTP) | 0.0.0.0/0 | Certbot HTTP challenge + redirect |
  | 443 (HTTPS) | 0.0.0.0/0 | Public web traffic |

- The EC2<->RDS security-group pair `ec2-rds-1` / `rds-ec2-1`, described as "auto-created", allowing private port 5432 (`83dba42`).
- Static Elastic IP; region us-east-1; public DNS via `vgomne.ddns.net` DDNS.

Not in the repo (and therefore presumably whatever AWS provisioned by default,
though the repo never says so): VPC ID or whether the default VPC was used,
subnets, route tables, NACLs, the Elastic IP value itself. Not found in repo
history.

---

## CI/CD

Deploys were **GitHub Actions over SSH** - no AWS-native deploy tooling
(no aws-actions/*, no configure-aws-credentials, no CodeDeploy) ever appears.
`.github/workflows/deploy.yml` (created `2e14d85`, final AWS-era form `578e153`)
runs on every push to master:

1. Checkout; Go 1.22; cross-compile `GOOS=linux GOARCH=amd64 go build -o server ./cmd/server/main.go`
2. Node 20; `npm ci --legacy-peer-deps && npm run build` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` injected from GitHub Secrets at build time
3. `appleboy/scp-action@v0.1.7` copies `backend/server`, `frontend/.next`, `frontend/public`, `package.json`, `package-lock.json` to `/home/ubuntu/church-website` using secrets `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`
4. `appleboy/ssh-action@v1.0.3` runs `sudo systemctl restart church-backend`, `npm ci --omit=dev --legacy-peer-deps`, `sudo systemctl restart church-frontend`, then `systemctl is-active` checks on both

The build ran on the runner by design: "Building on EC2 (especially Next.js)
freezes a 1GB RAM instance due to OOM. The GitHub runner has 7GB RAM and compiles
cleanly; only the finished artifacts are copied to the server" (deployment.md).
A manual path (local cross-compile + scp + `systemctl restart`) was documented too.

Same-day shakedown fixes on 2026-04-24 tell the bring-up story: wrong main.go path
(`d84155d`), env-var access (`ff45f2b`), missing `NEXT_PUBLIC_API_URL` at build
time (`631f0a2`), binary name mismatched against the unit's `ExecStart`
(`89649ae`), peer-deps on the EC2-side install (`1ef1714`).

**Still true at HEAD**: `deploy.yml` was never deleted or disabled after the
migration - the file at HEAD is byte-identical to `578e153` and still declares
`name: Deploy to EC2` on every master push. Whether it currently fails or no-ops
depends on GitHub-side secrets and the instance's existence, which the repo cannot
show. Post-migration deploys are Render/Vercel GitHub-webhook auto-builds
(`1a4fa42`), so the workflow is vestigial either way.

---

## What's NOT recoverable from this repo

- EC2 instance type and AMI (only "1 GB RAM", "Ubuntu")
- Ubuntu version; EBS volume size/type
- VPC, subnets, route tables, NACLs - no mention at all
- IAM role name and policy JSON - prose mentions only
- RDS minor version, storage, backups, Multi-AZ, parameter groups
- Actual values: RDS endpoint hostname, Elastic IP, SSH key (placeholders only - the bucket name is the one real identifier that was committed)
- DDNS provider and account
- Any nginx/certbot installation or hardening beyond the config and commands quoted above (no bootstrap scripts existed)
- Whether the 2 GB swapfile was actually applied
- Whether pre-AWS production ran on Render or Fly.io (README and deployment.md disagreed until `b6ace1b`)
- Any dollar figure for the AWS setup

---

## Cost and migration trigger - what the repo actually states

No commit message, commit body, PR description, or code comment states a monthly
cost, and none states the trigger for leaving in so many words. The closest
direct statements, all written at teardown time:

- AGENTS.md, added in `1a4fa42` (2026-05-15): "Everything is hosted on managed serverless platforms - no servers to maintain, **no AWS bill**."
- deployment.md, same commit: "There are no servers under our control. Every component is a managed service on a **free or near-free tier**. There is no Nginx, no systemd, no SSH, no SCP, no Elastic IP, no `.env` file on any server disk."
- AGENTS.md, added in `624ce0b` (2026-05-15): "The `supabase/migrations/` folder holds the original Supabase-era files from before **the RDS detour**; it is not the source of truth and is not re-applied."

Recorded friction during the era (facts the AWS-era docs state, not inferred
motives): the 1 GB instance OOM-froze on Next.js builds, requiring both the
runner-side cross-compile and a documented 2 GB swapfile workaround; and the
pre-AWS deployment.md had already framed Render's free tier (750 h/month, cold
starts acceptable) as sufficient for the workload.
