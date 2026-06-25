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

// A record's fields grouped into one reviewable "document" - e.g. a post's
// `title` and `body` translations shown together instead of as two unrelated
// cards. Keyed by (table_name, record_id, locale): the same post in two target
// locales is two groups, which is correct - each locale is reviewed on its own.
export interface TranslationRecordGroup {
  key: string
  table_name: string
  record_id: string
  locale: string
  record_title: string
  // Ordered title-first, then body, then any other fields alphabetically -
  // the order a human reads a post in.
  fields: AdminTranslation[]
}

// Lower number sorts first. Anything not listed falls after these, ordered
// alphabetically among themselves.
const FIELD_ORDER: Record<string, number> = { title: 0, body: 1 }

function compareFields(a: AdminTranslation, b: AdminTranslation): number {
  const ra = FIELD_ORDER[a.field_name] ?? 99
  const rb = FIELD_ORDER[b.field_name] ?? 99
  if (ra !== rb) return ra - rb
  return a.field_name.localeCompare(b.field_name)
}

// groupAdminTranslations buckets a flat list of translation rows into per-record
// groups, preserving the incoming order of first appearance (the backend sorts
// newest-first, so the newest record stays on top). Grouping is done here rather
// than on the backend because the per-field approve/retranslate endpoints are
// unchanged - this is purely how the rows are presented.
export function groupAdminTranslations(items: AdminTranslation[]): TranslationRecordGroup[] {
  const groups = new Map<string, TranslationRecordGroup>()
  for (const item of items) {
    const key = `${item.table_name}:${item.record_id}:${item.locale}`
    const existing = groups.get(key)
    if (existing) {
      existing.fields.push(item)
    } else {
      groups.set(key, {
        key,
        table_name: item.table_name,
        record_id: item.record_id,
        locale: item.locale,
        record_title: item.record_title,
        fields: [item],
      })
    }
  }
  const result = Array.from(groups.values())
  for (const g of result) g.fields.sort(compareFields)
  return result
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

export interface CleanupOrphansResponse {
  deleted_translations: number
  deleted_jobs: number
}

// cleanupOrphanTranslations: deletes translations whose parent record (post,
// page section, calendar event, month note) has been deleted, plus any
// pending queue jobs for those records. These show up in the review panel
// with "posts:a1b2c3d4"-style labels. Synchronous - counts are final when
// the response returns.
export async function cleanupOrphanTranslations(token: string): Promise<CleanupOrphansResponse> {
  return (await apiPost(`${BASE}/cleanup-orphans`, {}, token)) as CleanupOrphansResponse
}
