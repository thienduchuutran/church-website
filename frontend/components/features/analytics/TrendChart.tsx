'use client'

import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsPoint } from '@/lib/analytics-api'
import { compact, shortDate } from './format'

export interface TrendSeries {
  key: string
  label: string
  points: AnalyticsPoint[]
  // CSS variable name holding the series color, e.g. '--viz-1'.
  colorVar: string
}

// Line-over-time with up to two series. Marks follow the dataviz specs: 2px
// lines, a 10% wash under each, hairline horizontal grid only, legend present
// whenever there are two series, text in ink tokens never in the series hue.
// A table twin sits behind a toggle so every value is reachable without a
// pointer.
export default function TrendChart({
  title,
  series,
  bucket,
}: {
  title: string
  series: TrendSeries[]
  bucket: 'day' | 'week'
}) {
  const [asTable, setAsTable] = useState(false)

  // Merge series on the day key so Recharts gets one row per bucket.
  const byDay = new Map<string, Record<string, number | string>>()
  for (const s of series) {
    for (const p of s.points) {
      const row = byDay.get(p.day) ?? { day: p.day }
      row[s.key] = p.value
      byDay.set(p.day, row)
    }
  }
  const rows = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))
  const empty = rows.every((r) => series.every((s) => !r[s.key]))

  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="t-card text-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="font-sans text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {empty ? (
        <p className="py-10 text-center font-sans text-sm text-muted">No visits recorded in this range yet.</p>
      ) : asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full font-sans text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">{bucket === 'week' ? 'Week of' : 'Day'}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.day)} className="border-t border-border/60">
                  <td className="py-1 pr-3">{shortDate(String(r.day))}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right tabular-nums">
                      {Number(r[s.key] ?? 0).toLocaleString('en-US')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDate}
                tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tickFormatter={(v: number) => compact(v)}
                tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--foreground)',
                }}
                labelFormatter={(d) => shortDate(String(d))}
                formatter={(value, name) => [Number(value).toLocaleString('en-US'), String(name)]}
              />
              {series.length > 1 && (
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)' }}
                />
              )}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={`var(${s.colorVar})`}
                  strokeWidth={2}
                  fill={`var(${s.colorVar})`}
                  fillOpacity={0.1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
