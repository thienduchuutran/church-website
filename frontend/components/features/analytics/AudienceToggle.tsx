'use client'

import type { Audience } from '@/lib/analytics-api'
import { AUDIENCE_OPTIONS } from './copy'

// Which people the whole page describes. Sits in the single filter row next
// to the date range. "Visitors" is the default because that is the view shown
// to church leaders; "Admins" shows how co-admins use the tool; "Everyone"
// sums both. The owner's own visits are excluded server-side regardless.
// No label or tip beside the pills - the owner removed them (2026-11-06).
const ORDER: Audience[] = ['public', 'admin', 'all']

const PILL = 'rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors'
const PILL_IDLE = 'text-foreground hover:bg-accent/15 hover:text-accent'
const PILL_ON = 'bg-accent text-white'

export default function AudienceToggle({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  return (
    <div role="group" aria-label="Who to count" className="flex gap-1 rounded-full bg-panel p-1">
      {ORDER.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={value === a}
          className={`${PILL} ${value === a ? PILL_ON : PILL_IDLE}`}
          onClick={() => onChange(a)}
        >
          {AUDIENCE_OPTIONS[a]}
        </button>
      ))}
    </div>
  )
}
