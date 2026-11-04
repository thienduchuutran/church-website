import type { RouteStat } from '@/lib/analytics-api'
import { compact, percent } from './format'

// Backend health per route pattern. p95 is the worst hourly p95 in the range
// (an upper bound), p50 the request-weighted mean of hourly medians - both
// come from the logger middleware's buckets, not from a paid APM.
export default function RequestsTable({ routes }: { routes: RouteStat[] }) {
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <h3 className="t-card mb-3 text-foreground">Backend requests</h3>
      {routes.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-muted">No request stats flushed yet (they arrive hourly).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Route</th>
                <th className="py-1.5 pr-3 text-right font-medium">Requests</th>
                <th className="py-1.5 pr-3 text-right font-medium">5xx</th>
                <th className="py-1.5 pr-3 text-right font-medium">Error rate</th>
                <th className="py-1.5 pr-3 text-right font-medium">p50</th>
                <th className="py-1.5 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.route} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-xs text-foreground">{r.route}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{compact(r.count)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.errors_5xx}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{percent(r.error_rate, 1)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.p50_ms} ms</td>
                  <td className="py-1.5 text-right tabular-nums">{r.p95_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
