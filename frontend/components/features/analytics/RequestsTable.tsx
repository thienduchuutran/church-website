import InfoTip from '@/components/ui/InfoTip'
import type { RouteStat } from '@/lib/analytics-api'
import SectionTitle from './SectionTitle'
import { HEALTH_COLUMNS, SECTIONS, type Copy } from './copy'
import { compact, percent } from './format'

// Plain names for the server's route patterns. Anything not listed falls back
// to the raw pattern, which is still readable.
const ROUTE_LABELS: Record<string, string> = {
  '/api/v1/posts': 'Posts list',
  '/api/v1/posts/{id}': 'One post',
  '/api/v1/calendar': 'Calendar',
  '/api/v1/calendar/event-types': 'Calendar categories',
  '/api/v1/calendar/palette': 'Calendar colours',
  '/api/v1/pages/{slug}': 'About / Connect pages',
  '/api/v1/tags': 'Album tags',
  '/api/v1/reactions': 'Reactions',
  '/api/v1/reactions/{post_id}': 'Reactions on a post',
  '/api/v1/hero-video': 'Homepage video',
  '/api/v1/analytics/events': 'Visitor tracking',
  '/api/v1/admin/analytics/overview': 'This dashboard',
  '/api/v1/admin/analytics/timeseries': 'This dashboard (chart)',
  '/api/v1/admin/analytics/breakdown': 'This dashboard (lists)',
  '/api/v1/admin/analytics/content': 'This dashboard (posts)',
  '/api/v1/admin/analytics/pipeline': 'This dashboard (translations)',
  '/api/v1/admin/analytics/requests': 'This dashboard (health)',
  '/api/v1/admin/translations': 'Translation review',
  '/api/v1/auth/me': 'Sign-in check',
}

function Th({ copy, align = 'left' }: { copy: Copy; align?: 'left' | 'right' }) {
  return (
    <th className={`py-1.5 pr-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {copy.label}
        <InfoTip label={`What "${copy.label}" means`}>{copy.tip}</InfoTip>
      </span>
    </th>
  )
}

// Backend health per route pattern. p95 is the worst hourly p95 in the range
// (an upper bound), p50 the request-weighted mean of hourly medians - both
// come from the logger middleware's buckets, not from a paid APM.
export default function RequestsTable({ routes }: { routes: RouteStat[] }) {
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <SectionTitle copy={SECTIONS.health} />
      {routes.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-muted">Nothing recorded yet. Numbers arrive once an hour.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead className="text-muted">
              <tr>
                <Th copy={HEALTH_COLUMNS.route} />
                <Th copy={HEALTH_COLUMNS.requests} align="right" />
                <Th copy={HEALTH_COLUMNS.errors} align="right" />
                <Th copy={HEALTH_COLUMNS.errorRate} align="right" />
                <Th copy={HEALTH_COLUMNS.p50} align="right" />
                <Th copy={HEALTH_COLUMNS.p95} align="right" />
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.route} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 text-foreground" title={r.route}>
                    {ROUTE_LABELS[r.route] ?? r.route}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{compact(r.count)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.errors_5xx}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{percent(r.error_rate, 1)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.p50_ms} ms</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.p95_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
