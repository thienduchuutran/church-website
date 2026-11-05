import type { AnalyticsBreakdownRow } from '@/lib/analytics-api'
import SectionTitle from './SectionTitle'
import type { Copy } from './copy'
import { compact, percent } from './format'

// A top-N list with a share bar. One hue (--viz-1) for every bar because the
// rows are nominal categories - a darker-where-bigger ramp would double-encode
// what the bar length already says. Bars are thin (6px) with the share text in
// ink beside them, never on them.
export default function BreakdownTable({
  copy,
  rows,
  labelFor = (d) => d,
  emptyText = 'Nothing yet.',
}: {
  copy: Copy
  rows: AnalyticsBreakdownRow[]
  labelFor?: (dimension: string) => string
  emptyText?: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <SectionTitle copy={copy} />
      {rows.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-muted">{emptyText}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.dimension} className="font-sans text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-foreground" title={r.dimension}>
                  {labelFor(r.dimension)}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {compact(r.value)} <span className="text-xs">({percent(r.share)})</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel/60">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${max ? (r.value / max) * 100 : 0}%`, background: 'var(--viz-1)' }}
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
