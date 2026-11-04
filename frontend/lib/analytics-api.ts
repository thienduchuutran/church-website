// Admin analytics API - typed wrappers over GET /api/v1/admin/analytics/*.
// Shapes mirror backend/internal/model/types.go one-to-one; change both.

import { apiGet } from './api'

export interface AnalyticsTotals {
  visitors: number
  avg_daily_visitors: number
  peak_daily_visitors: number
  peak_day?: string
  sessions: number
  pageviews: number
  median_session_seconds: number
  return_rate: number
  vi_share: number
  pages_per_session: number
}

export interface AnalyticsOverview {
  from: string
  to: string
  current: AnalyticsTotals
  previous: AnalyticsTotals
}

export interface AnalyticsPoint {
  day: string
  value: number
}

export interface AnalyticsBreakdownRow {
  dimension: string
  value: number
  share: number
}

export interface ContentStat {
  post_id: string
  title: string
  type: string
  published_at: string
  reads: number
  reactions: number
}

export interface PipelineStats {
  translations_produced: number
  approved_unedited: number
  approved_edited: number
  pending_review: number
  median_lead_seconds: number | null
  posts_published: number
  reactions_added: number
  fine_tuning_pairs: number
}

export interface RouteStat {
  route: string
  count: number
  errors_5xx: number
  errors_4xx: number
  error_rate: number
  p50_ms: number
  p95_ms: number
}

export type TimeseriesMetric =
  | 'visitors'
  | 'visitors_locale'
  | 'sessions'
  | 'sessions_locale'
  | 'pageviews'
  | 'returning_sessions'
  | 'events'
  | 'session_seconds_median'
  | 'post_reads'

export type BreakdownDimension = 'path' | 'locale' | 'device' | 'referrer' | 'event' | 'hour' | 'post'

export interface DateRange {
  from: string // YYYY-MM-DD inclusive
  to: string // YYYY-MM-DD inclusive
}

export type RangePreset = '7d' | '30d' | '90d' | '12m'

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// presetRange ends today (local) and reaches back N-1 days, so "7d" is the
// last seven calendar days including today.
export function presetRange(preset: RangePreset, today = new Date()): DateRange {
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const from = new Date(to)
  switch (preset) {
    case '7d':
      from.setDate(from.getDate() - 6)
      break
    case '30d':
      from.setDate(from.getDate() - 29)
      break
    case '90d':
      from.setDate(from.getDate() - 89)
      break
    case '12m':
      from.setFullYear(from.getFullYear() - 1)
      from.setDate(from.getDate() + 1)
      break
  }
  return { from: isoLocal(from), to: isoLocal(to) }
}

export function rangeDays(range: DateRange): number {
  const a = Date.parse(range.from)
  const b = Date.parse(range.to)
  return Math.round((b - a) / 86_400_000) + 1
}

function qs(range: DateRange, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams({ from: range.from, to: range.to })
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '') p.set(k, String(v))
  }
  return `?${p.toString()}`
}

export function getOverview(token: string, range: DateRange): Promise<AnalyticsOverview> {
  return apiGet(`/api/v1/admin/analytics/overview${qs(range)}`, token)
}

export async function getTimeseries(
  token: string,
  range: DateRange,
  metric: TimeseriesMetric,
  opts: { dimension?: string; bucket?: 'day' | 'week' } = {},
): Promise<AnalyticsPoint[]> {
  const res = await apiGet(
    `/api/v1/admin/analytics/timeseries${qs(range, { metric, dimension: opts.dimension, bucket: opts.bucket })}`,
    token,
  )
  return res.points as AnalyticsPoint[]
}

export async function getBreakdown(
  token: string,
  range: DateRange,
  dimension: BreakdownDimension,
  limit = 10,
): Promise<AnalyticsBreakdownRow[]> {
  const res = await apiGet(`/api/v1/admin/analytics/breakdown${qs(range, { dimension, limit })}`, token)
  return res.rows as AnalyticsBreakdownRow[]
}

export async function getContent(token: string, range: DateRange): Promise<ContentStat[]> {
  const res = await apiGet(`/api/v1/admin/analytics/content${qs(range)}`, token)
  return res.items as ContentStat[]
}

export function getPipeline(token: string, range: DateRange): Promise<PipelineStats> {
  return apiGet(`/api/v1/admin/analytics/pipeline${qs(range)}`, token)
}

export async function getRequests(token: string, range: DateRange): Promise<RouteStat[]> {
  const res = await apiGet(`/api/v1/admin/analytics/requests${qs(range)}`, token)
  return res.routes as RouteStat[]
}
