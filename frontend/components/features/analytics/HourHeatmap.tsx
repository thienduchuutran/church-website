'use client'

import { useState } from 'react'
import type { AnalyticsBreakdownRow } from '@/lib/analytics-api'
import SectionTitle from './SectionTitle'
import { SECTIONS } from './copy'
import { DOW, hourLabel } from './format'

// Day-of-week x hour grid of page views. Magnitude is one hue (the brand plum,
// --viz-1) mixed into the surface from 8% to 100% - a sequential ramp, never a
// rainbow. Rows are Sunday first because that is the day this congregation's
// week turns on. Each cell carries a title so hover and screen readers both
// get the number; a table twin sits behind the toggle.
export default function HourHeatmap({ rows }: { rows: AnalyticsBreakdownRow[] }) {
  const [asTable, setAsTable] = useState(false)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  let max = 0
  for (const r of rows) {
    const [d, h] = r.dimension.split('-').map(Number)
    if (d >= 0 && d < 7 && h >= 0 && h < 24) {
      grid[d][h] = r.value
      if (r.value > max) max = r.value
    }
  }
  const empty = max === 0

  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <SectionTitle
        copy={SECTIONS.heatmap}
        right={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="font-sans text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
          >
            {asTable ? 'Show grid' : 'Show table'}
          </button>
        }
      />
      {empty ? (
        <p className="py-10 text-center font-sans text-sm text-muted">No page views in this period yet.</p>
      ) : asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full font-sans text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Day</th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="py-1 pr-1 text-right font-medium">
                    {hourLabel(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={d} className="border-t border-border/60">
                  <td className="py-1 pr-2">{DOW[d]}</td>
                  {row.map((v, h) => (
                    <td key={h} className="py-1 pr-1 text-right tabular-nums">
                      {v || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: '2.25rem repeat(24, minmax(0, 1fr))' }}>
              <span aria-hidden />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="text-center font-sans text-[10px] text-muted">
                  {h % 3 === 0 ? hourLabel(h) : ''}
                </span>
              ))}
              {grid.map((row, d) => (
                <RowCells key={d} day={DOW[d]} row={row} max={max} />
              ))}
            </div>
            <p className="mt-2 flex items-center gap-2 font-sans text-[11px] text-muted">
              <span>quieter</span>
              <span className="flex gap-[2px]">
                {[0.08, 0.3, 0.55, 0.8, 1].map((a) => (
                  <span
                    key={a}
                    className="inline-block h-3 w-5 rounded-[3px]"
                    style={{ background: `color-mix(in oklab, var(--viz-1) ${a * 100}%, var(--surface))` }}
                  />
                ))}
              </span>
              <span>busier</span>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function RowCells({ day, row, max }: { day: string; row: number[]; max: number }) {
  return (
    <>
      <span className="self-center font-sans text-[11px] text-muted">{day}</span>
      {row.map((v, h) => {
        const alpha = v === 0 ? 0 : 0.08 + 0.92 * (v / max)
        return (
          <span
            key={h}
            role="img"
            aria-label={`${day} ${hourLabel(h)}: ${v} page views`}
            title={`${day} ${hourLabel(h)}: ${v} page views`}
            className="aspect-square rounded-[3px] bg-panel/60"
            style={v === 0 ? undefined : { background: `color-mix(in oklab, var(--viz-1) ${Math.round(alpha * 100)}%, var(--surface))` }}
          />
        )
      })}
    </>
  )
}
