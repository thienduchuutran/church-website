import { apiGet } from './api'

const DISCORD_BASE = '/api/v1/admin/discord'

// DiscordStatus mirrors GET /admin/discord/status. The discord_* fields are
// present only when `linked` is true.
export interface DiscordStatus {
  linked: boolean
  discord_username?: string
  discord_avatar_url?: string
}

// getDiscordStatus reports whether the current admin has linked their Discord
// account, so the composer can show "posts as <name>" or a link nudge. Admin
// token required.
export async function getDiscordStatus(token: string): Promise<DiscordStatus> {
  return (await apiGet(`${DISCORD_BASE}/status`, token)) as DiscordStatus
}

// getDiscordLinkUrl returns the Discord OAuth consent URL to navigate the
// browser to. The backend returns a URL (rather than redirecting) because a
// top-level navigation cannot carry the Bearer token - so we fetch it with the
// token here, then redirect. Throws ApiError(503) when Discord linking is not
// configured on the server.
export async function getDiscordLinkUrl(token: string): Promise<string> {
  const res = (await apiGet(`${DISCORD_BASE}/link`, token)) as { url: string }
  return res.url
}
