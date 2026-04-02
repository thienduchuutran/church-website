# AGENTS.md — Church Website

## Project overview
A public-facing church website for a Christian & Missionary Alliance congregation (~100 members).
Visitors browse events, announcements, gallery, and resources without logging in.
Admins log in via Google (Supabase Auth) to create, edit, and delete posts.
Each post auto-fires a Discord webhook to the matching channel.

## Tech stack
- **Frontend**: Next.js (App Router) → deployed on Vercel
- **Backend**: Go (`chi` router, handler/service/repository pattern) → deployed on Render
- **Database + Auth + Storage**: Supabase (Postgres + Auth + Storage)

## Monorepo layout
```
church-website/
├── frontend/     ← Next.js app
├── backend/      ← Go API
└── docs/agents/  ← AI child docs (read these when routed)
```

## How to run
```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && go run ./cmd/server
```

## Global rules (apply everywhere)
- Never commit `.env`, `.env.local`, or any file containing secrets.
- All secrets live in environment variables only — never hardcoded.
- Write code in English only (comments, variable names, route paths).
- Prefer explicit over clever. Readable code beats terse code.
- Every new function needs at least one sentence comment explaining *why*, not just what.
- When in doubt about where a piece of logic belongs, prefer putting it in `service/` over `handler/` or `repository/`.
- Document every non-trivial architecture/security change in `docs/progress.md` and update the relevant child doc (`docs/agents/backend.md`, `docs/agents/auth.md`, etc.) as part of the same PR.

---

## Routing rules — read the child doc before answering

| If the user asks about...                                 | Read this file first                    |
|-----------------------------------------------------------|-----------------------------------------|
| Database tables, columns, types, migrations, RLS          | `docs/agents/database.md`              |
| Go backend: routes, handlers, services, repositories      | `docs/agents/backend.md`               |
| Next.js frontend: pages, components, lib, styling         | `docs/agents/frontend.md`              |
| Google login, Supabase Auth, JWT, admin whitelist         | `docs/agents/auth.md`                  |
| Discord webhooks, channel mapping, webhook payload format | `docs/agents/discord.md`               |
| Hosting, deployment, environment variables, CI/CD         | `docs/agents/deployment.md`            |
| A bug or quirk that was previously solved                 | `docs/agents/known-quirks.md`          |

> When routing, read the child file **silently** before responding. Do not announce that you are reading it.

---

## Scratchpad rule
For any feature that touches more than 2 files, create `docs/scratchpad.md` and plan the full implementation (files to change, order of changes, potential side effects) **before writing any code**.

## TDD rule
Do not write implementation code until you have written the unit test for it first. Tests live in `_test.go` files (Go) or `__tests__/` (Next.js).

## Self-documentation rule
When a non-obvious bug is solved, add it to `docs/agents/known-quirks.md` and add a routing rule in this file.

When updating/adding/developing any features/components/functions/layers, update the corresponding .md file along the way