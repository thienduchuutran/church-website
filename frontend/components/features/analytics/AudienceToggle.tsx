'use client'

import InfoTip from '@/components/ui/InfoTip'
import type { Audience } from '@/lib/analytics-api'
import { AUDIENCE } from './copy'

// Which people the whole page describes. Sits in the single filter row next
// to the date range. "Visitors" is the default because that is the view shown
// to church leaders; "Admins" shows how co-admins use the tool; "Everyone"
// sums both. The owner's own visits are excluded server-side regardless.
const ORDER: Audience[] = ['public', 'admin', 'all']

const PILL = 'rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors'
const PILL_IDLE = 'text-foreground hover:bg-accent/15 hover:text-accent'
const PILL_ON = 'bg-accent text-white'

export default function AudienceToggle({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 font-sans text-sm text-muted">
        {AUDIENCE.label}
        <InfoTip label={`What "${AUDIENCE.label}" means`}>{AUDIENCE.tip}</InfoTip>
      </span>
      <div role="group" aria-label={AUDIENCE.label} className="flex gap-1 rounded-full bg-panel p-1">
        {ORDER.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={value === a}
            className={`${PILL} ${value === a ? PILL_ON : PILL_IDLE}`}
            onClick={() => onChange(a)}
          >
            {AUDIENCE.options[a]}
          </button>
        ))}
      </div>
    </div>
  )
}
