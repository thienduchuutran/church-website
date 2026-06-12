import { apiGet, apiPut } from './api'

// PageContentResponse mirrors the Go backend's response for GET /pages/:slug.
// `machine_translated` is omitted on English responses (Go's omitempty), so
// callers should treat `undefined` as `false` - the badge only renders on
// explicit `true`.
export interface PageContentResponse {
  sections: Record<string, string>
  machine_translated?: boolean
}

// getPageContent reads a static page's sections from the backend. Accepts an
// optional locale so /vi/about gets Vietnamese content via the translation
// engine's COALESCE join; English requests bypass the join entirely. The
// fallback defaults are merged in at the page layer, not here, so this
// function stays a thin transport wrapper.
export async function getPageContent(slug: string, locale?: string): Promise<PageContentResponse> {
  const qs = locale && locale !== 'en' ? `?locale=${encodeURIComponent(locale)}` : ''
  const data = (await apiGet(`/api/v1/pages/${slug}${qs}`)) as PageContentResponse | undefined
  return {
    sections: data?.sections ?? {},
    machine_translated: data?.machine_translated,
  }
}

// updatePageContent is the admin write path. No locale param: admins edit
// the English source; the worker fans translations out afterwards.
export async function updatePageContent(
  slug: string,
  sections: Record<string, string>,
  token: string,
): Promise<void> {
  await apiPut(`/api/v1/pages/${slug}`, { sections }, token)
}
