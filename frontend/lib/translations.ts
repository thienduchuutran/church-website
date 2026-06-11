import { apiGet, apiPatch, apiPost } from './api'

// AdminTranslation mirrors the Go backend's TranslationListItem - a Translation
// row plus the synthesized record_title from the multi-table JOIN. The admin
// review panel is the only consumer of these endpoints; public read paths
// hydrate translated text inline via COALESCE inside posts/calendar/pages.
export interface AdminTranslation {
  id: string
  table_name: string
  record_id: string
  field_name: string
  locale: string
  source_text: string
  translated_text: string
  is_ai_generated: boolean
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  // Human label: post title, "page_slug / section_key", "event title · date",
  // or "Month note · YYYY-MM". Falls back to "<table>:<short-uuid>" when the
  // parent record has been deleted (orphan).
  record_title: string
}

export interface AdminTranslationListResponse {
  items: AdminTranslation[]
  total: number
}

export interface AdminTranslationListFilters {
  locale?: string
  // Tri-state: undefined = all, false = needs review, true = approved.
  // Matches the backend's omit-param-for-all convention.
  approved?: boolean
  limit?: number
  offset?: number
}

const BASE = '/api/v1/admin/translations'

export async function listAdminTranslations(
  filters: AdminTranslationListFilters,
  token: string,
): Promise<AdminTranslationListResponse> {
  const params = new URLSearchParams()
  if (filters.locale) params.set('locale', filters.locale)
  if (filters.approved !== undefined) params.set('approved', String(filters.approved))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.offset !== undefined) params.set('offset', String(filters.offset))
  const qs = params.toString()
  return (await apiGet(`${BASE}${qs ? '?' + qs : ''}`, token)) as AdminTranslationListResponse
}

// approveTranslation: pass translatedText=null to approve the AI output
// as-is (PATCH with no body); pass a string to approve a human-edited version.
export async function approveTranslation(
  id: string,
  translatedText: string | null,
  token: string,
): Promise<AdminTranslation> {
  const body = translatedText !== null ? { translated_text: translatedText } : {}
  return (await apiPatch(`${BASE}/${id}`, body, token)) as AdminTranslation
}

// retranslateTranslation: deletes the existing row and re-enqueues a fresh
// translation job. Use after editing the system prompt. Returns the (now
// deleted) source metadata - the new translated_text won't exist until the
// worker drains the job (~5s).
export async function retranslateTranslation(id: string, token: string): Promise<AdminTranslation> {
  return (await apiPost(`${BASE}/retranslate/${id}`, {}, token)) as AdminTranslation
}

export interface RetranslateAllResponse {
  // Count of translations deleted + re-queued. Approved rows are not touched.
  requeued: number
}

// retranslateAllTranslations: bulk version - delete every unapproved row and
// re-queue. Use after running `scripts/sync-prompt.sh` to push a new system
// prompt. Approved (human-reviewed) translations are NEVER auto-clobbered;
// to refresh those, use the per-row Re-translate button on each card.
export async function retranslateAllTranslations(token: string): Promise<RetranslateAllResponse> {
  return (await apiPost(`${BASE}/retranslate-all`, {}, token)) as RetranslateAllResponse
}
