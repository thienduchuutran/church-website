'use client'

import { presetRange, type DateRange, type RangePreset } from '@/lib/analytics-api'

// One filter row above every chart on the analytics page (never a filter per
// card). Presets are pills; "Custom" reveals two native date inputs, which
// are the right control on a phone and need no library.
const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
]

const PILL = 'rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors'
const PILL_IDLE = 'text-foreground hover:bg-accent/15 hover:text-accent'
const PILL_ON = 'bg-accent text-white'

export default function DateRangePicker({
  preset,
  range,
  onChange,
}: {
  preset: RangePreset | 'custom'
  range: DateRange
  onChange: (preset: RangePreset | 'custom', range: DateRange) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-full bg-panel p-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={preset === p.value}
            className={`${PILL} ${preset === p.value ? PILL_ON : PILL_IDLE}`}
            onClick={() => onChange(p.value, presetRange(p.value))}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={preset === 'custom'}
          className={`${PILL} ${preset === 'custom' ? PILL_ON : PILL_IDLE}`}
          onClick={() => onChange('custom', range)}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 font-sans text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-muted">From</span>
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && onChange('custom', { from: e.target.value, to: range.to })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted">To</span>
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && onChange('custom', { from: range.from, to: e.target.value })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
            />
          </label>
        </div>
      )}
    </div>
  )
}
