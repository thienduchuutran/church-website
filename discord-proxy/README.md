# discord-proxy - Cloudflare Worker webhook proxy

A transparent same-path proxy that forwards our Discord webhook requests through
Cloudflare's clean egress IP.

## Why

Discord globally rate-limits by **source IP**. The Go backend runs on Render's
free tier, whose outbound traffic shares one NAT egress IP with many tenants;
collectively they trip Discord's global limit and Discord blocks the IP
(`429`, "exceeding global rate limits", ~35-minute bans). Our single request per
post gets caught in the shared ban - so prod posts never reach Discord while
local dev (a clean home IP) works fine.

A Cloudflare Worker egresses from Cloudflare's network, an IP Discord does not
block, so routing webhook calls through it restores delivery without changing
our request volume or leaving the $0 tier.

## How the backend uses it

When `DISCORD_PROXY_BASE` is set, `backend/internal/discord/send.go` rewrites
each `https://discord.com/api/webhooks/...` call to `{DISCORD_PROXY_BASE}/api/
webhooks/...` (path preserved) and adds an `X-Webhook-Proxy-Key` header. When
the env var is empty (local dev) it talks to Discord directly - no proxy.

## Deploy

Prereqs: a free Cloudflare account and `npm i -g wrangler`.

```powershell
cd discord-proxy
wrangler login
# Pick a strong random value; use the SAME value for the backend's DISCORD_PROXY_SECRET.
wrangler secret put PROXY_KEY
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://discord-webhook-proxy.<your-subdomain>.workers.dev`.

## Wire it up

Set on the **Render backend** (Environment tab):

| Var | Value |
|---|---|
| `DISCORD_PROXY_BASE` | the Worker URL from `wrangler deploy` (no trailing slash) |
| `DISCORD_PROXY_SECRET` | the same value you gave `wrangler secret put PROXY_KEY` |

Leave both **unset locally** so dev keeps talking to Discord directly.

## Verify

Create a test event post on prod. It should appear in the Discord channel, and
the Render logs should show no `discord: send failed ... 429`. To sanity-check
the Worker alone, an unauthorized request must be rejected:

```powershell
curl -i "https://discord-webhook-proxy.<your-subdomain>.workers.dev/api/webhooks/x/y"
# expect: HTTP/1.1 403 forbidden   (no/So wrong X-Webhook-Proxy-Key)
```
