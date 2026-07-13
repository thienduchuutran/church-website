// Discord webhook proxy (Cloudflare Worker)
//
// WHY THIS EXISTS
// Discord globally rate-limits by SOURCE IP. Our Go backend runs on Render's
// free tier, whose outbound traffic shares one NAT egress IP with many other
// tenants; collectively they exceed Discord's global limit, so Discord blocks
// that IP (HTTP 429, "exceeding global rate limits", ~35-minute bans). Our own
// single request per post gets caught in someone else's ban.
//
// A Cloudflare Worker egresses from Cloudflare's network - a clean IP Discord
// does not block - so routing our webhook calls through here fixes delivery
// without changing our request volume or leaving the $0 hosting tier.
//
// WHAT IT DOES
// A transparent, same-path forwarder: it takes /api/webhooks/... requests,
// forwards them to https://discord.com/api/webhooks/... unchanged (method,
// query like ?wait=true, headers, and body - including multipart image
// uploads), and returns Discord's response verbatim so the Go client still
// reads the message id, status code, and Retry-After header.
//
// SECURITY
// A shared secret (PROXY_KEY, set via `wrangler secret put PROXY_KEY`) gates
// every request so this cannot be used as an open Discord relay. It is checked,
// then stripped before forwarding so it never reaches Discord. The Worker only
// ever forwards to discord.com/api/webhooks/*, never an arbitrary host.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only Discord webhook paths are proxied - nothing else is forwardable.
    if (!url.pathname.startsWith("/api/webhooks/")) {
      return new Response("not found", { status: 404 });
    }

    // Shared-secret gate: reject anything without the matching key so the
    // Worker is not an open relay burning our quota / clean IP for strangers.
    if (!env.PROXY_KEY || request.headers.get("X-Webhook-Proxy-Key") !== env.PROXY_KEY) {
      return new Response("forbidden", { status: 403 });
    }

    // Rebuild the Discord URL, preserving path AND query (?wait=true is what
    // makes Discord return the message id our backend stores for edit/delete).
    const target = "https://discord.com" + url.pathname + url.search;

    // Forward headers as-is except our auth key (must not leak to Discord) and
    // Host (fetch sets the correct one for discord.com).
    const headers = new Headers(request.headers);
    headers.delete("X-Webhook-Proxy-Key");
    headers.delete("Host");

    // Buffer the body for non-idempotent methods so multipart uploads forward
    // intact without relying on request-stream duplex support. Payloads are
    // small (one message, <=10 images, Discord's own 25 MB ceiling).
    const method = request.method;
    const body =
      method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

    const resp = await fetch(target, { method, headers, body });

    // Return Discord's response verbatim - status, body, and headers (notably
    // Retry-After, which our backend logs to distinguish rate-limit flavors).
    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  },
};
