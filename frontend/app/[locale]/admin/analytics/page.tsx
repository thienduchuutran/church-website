'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import {
  getBreakdown,
  getContent,
  getOverview,
  getPipeline,
  getRequests,
  getTimeseries,
  presetRange,
  rangeDays,
  type AnalyticsBreakdownRow,
  type AnalyticsOverview,
  type AnalyticsPoint,
  type Audience,
  type ContentStat,
  type DateRange,
  type PipelineStats,
  type RangePreset,
  type RouteStat,
} from '@/lib/analytics-api'
import DateRangePicker from '@/components/features/analytics/DateRangePicker'
import AudienceToggle from '@/components/features/analytics/AudienceToggle'
import StatTile from '@/components/features/analytics/StatTile'
import TrendChart from '@/components/features/analytics/TrendChart'
import HourHeatmap from '@/components/features/analytics/HourHeatmap'
import BreakdownTable from '@/components/features/analytics/BreakdownTable'
import ContentTable from '@/components/features/analytics/ContentTable'
import PipelinePanel from '@/components/features/analytics/PipelinePanel'
import RequestsTable from '@/components/features/analytics/RequestsTable'
import SectionTitle from '@/components/features/analytics/SectionTitle'
import { AUDIENCE, DEVICE_LABELS, EVENT_LABELS, SECTIONS, TILES } from '@/components/features/analytics/copy'
import { compact, delta, duration, longDate, percent } from '@/components/features/analytics/format'

interface Data {
  overview: AnalyticsOverview
  en: AnalyticsPoint[]
  vi: AnalyticsPoint[]
  paths: AnalyticsBreakdownRow[]
  devices: AnalyticsBreakdownRow[]
  referrers: AnalyticsBreakdownRow[]
  hours: AnalyticsBreakdownRow[]
  events: AnalyticsBreakdownRow[]
  content: ContentStat[]
  pipeline: PipelineStats
  requests: RouteStat[]
}

// Admin-only. Same gate as the other admin pages: wait for auth, bounce
// non-admins home. Every panel re-fetches against one shared range and one
// shared audience; while a refetch is in flight the previous render stays at
// reduced opacity rather than flashing a skeleton. Every label and its "i"
// explanation comes from copy.ts so the wording is tuned in one file.
export default function AdminAnalyticsPage() {
  const { session, isAdmin, loading } = useAuth()
  const router = useRouter()
  const token = session?.access_token ?? null

  const [preset, setPreset] = useState<RangePreset | 'custom'>('30d')
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'))
  // Visitors by default: the view shown to church leaders is the public only.
  const [audience, setAudience] = useState<Audience>('public')
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bucket: 'day' | 'week' = rangeDays(range) > 92 ? 'week' : 'day'

  const load = useCallback(async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const [overview, en, vi, paths, devices, referrers, hours, events, content, pipeline, requests] = await Promise.all([
        getOverview(token, range, audience),
        getTimeseries(token, range, 'visitors_locale', { dimension: 'en', bucket, audience }),
        getTimeseries(token, range, 'visitors_locale', { dimension: 'vi', bucket, audience }),
        getBreakdown(token, range, 'path', 10, audience),
        getBreakdown(token, range, 'device', 3, audience),
        getBreakdown(token, range, 'referrer', 8, audience),
        getBreakdown(token, range, 'hour', 50, audience),
        getBreakdown(token, range, 'event', 10, audience),
        getContent(token, range, audience),
        getPipeline(token, range),
        getRequests(token, range),
      ])
      setData({ overview, en, vi, paths, devices, referrers, hours, events, content, pipeline, requests })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the numbers')
    } finally {
      setBusy(false)
    }
  }, [token, range, bucket, audience])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading...</p>
      </div>
    )
  }
  if (!session || !isAdmin) {
    router.push('/')
    return null
  }

  const cur = data?.overview.current
  const prev = data?.overview.previous

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-title text-foreground">How the site is doing</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            {longDate(range.from)} to {longDate(range.to)} · {AUDIENCE.options[audience]} · anonymous, no cookies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AudienceToggle value={audience} onChange={setAudience} />
          <DateRangePicker
            preset={preset}
            range={range}
            onChange={(p, r) => {
              setPreset(p)
              setRange(r)
            }}
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-border bg-panel px-4 py-2 font-sans text-sm text-foreground">{error}</p>
      )}

      <div className={`space-y-6 transition-opacity ${busy ? 'opacity-60' : 'opacity-100'}`}>
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            copy={TILES.visitors}
            value={cur ? compact(cur.visitors) : '-'}
            delta={cur && prev ? delta(cur.visitors, prev.visitors) : null}
            caption="counted once per day"
          />
          <StatTile
            copy={TILES.peak}
            value={cur ? compact(cur.peak_daily_visitors) : '-'}
            caption={cur?.peak_day ? longDate(cur.peak_day) : undefined}
          />
          <StatTile
            copy={TILES.visits}
            value={cur ? compact(cur.sessions) : '-'}
            delta={cur && prev ? delta(cur.sessions, prev.sessions) : null}
          />
          <StatTile
            copy={TILES.visitLength}
            value={cur ? duration(cur.median_session_seconds) : '-'}
            delta={cur && prev ? delta(cur.median_session_seconds, prev.median_session_seconds) : null}
          />
          <StatTile
            copy={TILES.cameBack}
            value={cur ? percent(cur.return_rate) : '-'}
            delta={cur && prev ? delta(cur.return_rate, prev.return_rate) : null}
          />
          <StatTile
            copy={TILES.vietnamese}
            value={cur ? percent(cur.vi_share) : '-'}
            delta={cur && prev ? delta(cur.vi_share, prev.vi_share) : null}
          />
        </div>

        {/* Trend + heatmap */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <TrendChart
              bucket={bucket}
              series={[
                { key: 'en', label: 'English', points: data?.en ?? [], colorVar: '--viz-1' },
                { key: 'vi', label: 'Vietnamese', points: data?.vi ?? [], colorVar: '--viz-2' },
              ]}
            />
          </div>
          <div className="lg:col-span-2">
            <HourHeatmap rows={data?.hours ?? []} />
          </div>
        </div>

        {/* Lists */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <BreakdownTable copy={SECTIONS.topPages} rows={data?.paths ?? []} />
          <BreakdownTable
            copy={SECTIONS.actions}
            rows={data?.events ?? []}
            labelFor={(d) => EVENT_LABELS[d] ?? d}
            emptyText="Nothing beyond page views yet."
          />
          <BreakdownTable copy={SECTIONS.devices} rows={data?.devices ?? []} labelFor={(d) => DEVICE_LABELS[d] ?? d} />
          <BreakdownTable
            copy={SECTIONS.sources}
            rows={data?.referrers ?? []}
            labelFor={(d) => (d === 'direct' ? 'Direct / typed' : d)}
          />
        </div>

        {/* Posts + translations */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ContentTable items={data?.content ?? []} />
          </div>
          <div className="lg:col-span-2">
            {data?.pipeline ? (
              <PipelinePanel stats={data.pipeline} />
            ) : (
              <section className="rounded-[14px] border border-border/60 bg-surface p-4">
                <SectionTitle copy={SECTIONS.pipeline} />
                <p className="py-6 text-center font-sans text-sm text-muted">Loading...</p>
              </section>
            )}
          </div>
        </div>

        <RequestsTable routes={data?.requests ?? []} />

        {cur && (
          <p className="font-sans text-xs text-muted">
            {cur.pages_per_session.toLocaleString('en-US')} pages per visit · {compact(cur.pageviews)} page views in total ·
            about {cur.avg_daily_visitors.toLocaleString('en-US')} visitors a day
          </p>
        )}
      </div>
    </div>
  )
}
