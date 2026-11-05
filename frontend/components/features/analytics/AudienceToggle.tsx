'use client'

import type { Audience } from '@/lib/analytics-api'

// Which visitors the whole page describes. Sits in the single filter row next
// to the date range. Public is the default because that is the view shown to
// church leaders; Admins shows how co-admins use the tool; All sums both.
const OPTIONS: { value: Audience; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'admin', label: 'Admins' },
  { value: 'all', label: 'All' },
]

const PILL = 'rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors'
const PILL_IDLE = 'text-foreground hover:bg-accent/15 hover:text-accent'
const PILL_ON = 'bg-accent text-white'

export default function AudienceToggle({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  return (
    <div role="group" aria-label="Audience" className="flex gap-1 rounded-full bg-panel p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={`${PILL} ${value === o.value ? PILL_ON : PILL_IDLE}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
