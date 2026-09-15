'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { extendSeries, getSeries } from '@/lib/calendar'
import type { CalendarSeries } from '@/components/features/calendar/types'

// Tells an admin when recurring events are about to run out of dates, and tops
// them up.
//
// Occurrences are stored as real rows rather than expanded from a rule
// (DECISIONS.md, 2026-09-14), which is what keeps the calendar, the PNG export
// and the assistant simple. The price is that rows are generated a finite
// distance ahead, and something has to refill them. This is that something.
//
// It renders NOTHING while every series still has years to run. A panel that
// permanently reads "nothing to do" is a panel people stop seeing, and this one
// needs to be read the single time it matters. The rule that decides when it
// appears lives in service.needsExtension and is covered by tests that hand it
// a date, because with a three-year horizon nothing can trigger it until 2029 -
// a rule whose first real evaluation is years away rots unless something
// exercises it.

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Formatted from the string's own parts rather than through the Date
// constructor, which reads a bare YYYY-MM-DD as UTC midnight and rolls back a
// day - and sometimes a month - for anyone west of Greenwich. The church is in
// Massachusetts, so that is every viewer.
function monthYear(iso: string, months: string[]): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso)
  if (!m) return iso
  return `${months[Number(m[2]) - 1]} ${m[1]}`
}

export default function RepeatingEventsNotice() {
  const { session } = useAuth()
  const token = session?.access_token ?? null

  const [expiring, setExpiring] = useState<CalendarSeries[]>([])
  const [showList, setShowList] = useState(false)
  const [working, setWorking] = useState(false)
  const [added, setAdded] = useState<{ dates: number; through: string } | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const all = await getSeries(token)
      setExpiring(all.filter((s) => s.needs_extension))
    } catch {
      // Silent: a dashboard that cannot reach this endpoint should show one
      // fewer panel, not an error about a maintenance job nobody asked about.
      setExpiring([])
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function handleExtend() {
    if (!token || expiring.length === 0) return
    setWorking(true)
    setFailed(false)
    try {
      // Sequential, not parallel. Each call writes rows, and fifty-one
      // concurrent writes through a connection pooler is a way to find out how
      // many connections the pooler has. This runs once every three years.
      let dates = 0
      for (const s of expiring) {
        const res = await extendSeries(s.id, token)
        dates += res.added
      }
      const all = await getSeries(token)
      const furthest = all.reduce((max, s) => (s.last_date > max ? s.last_date : max), '')
      setAdded({ dates, through: furthest })
      setExpiring(all.filter((s) => s.needs_extension))
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  // The success line outlives the warning it replaced, so pressing the button
  // leaves visible evidence of what happened rather than the panel silently
  // vanishing.
  if (added && expiring.length === 0) {
    return (
      <div className="mb-8 space-y-4">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
          Repeating Events
        </h2>
        <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Added {added.dates} {added.dates === 1 ? 'date' : 'dates'}. Repeating events now run
            through {monthYear(added.through, MONTHS_LONG)}.
          </span>
        </div>
      </div>
    )
  }

  if (expiring.length === 0) return null

  // The earliest last-date is the one that actually bites, so that is the date
  // the headline names.
  const soonest = expiring.reduce(
    (min, s) => (s.last_date < min ? s.last_date : min),
    expiring[0].last_date,
  )

  return (
    <div className="mb-8 space-y-4">
      <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
        Repeating Events
      </h2>

      <div className="card-rest rounded-xl border border-border bg-surface p-6">
        {/* Amber rather than the brand magenta: magenta is what this site uses
            for the thing you should press, and if the warning wore it too,
            "needs attention" and "press this" would look identical. */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700">
            <path d="M12 3v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="18" r="1.4" fill="currentColor" />
            <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
          </svg>
          <div className="min-w-0">
            <p className="font-sans text-sm font-bold text-amber-800">
              {expiring.length} repeating {expiring.length === 1 ? 'event stops' : 'events stop'} after{' '}
              {monthYear(soonest, MONTHS_LONG)}
            </p>
            <p className="mt-1 font-sans text-sm text-muted">
              They will simply stop appearing on the calendar after that date. Adding three more
              years takes a moment and changes nothing that is already there.
            </p>
          </div>
        </div>

        {failed && (
          <p className="mt-3 font-sans text-sm text-red-700">
            Could not add the dates. Nothing was changed - try again, and if it keeps failing the
            backend may be restarting.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExtend}
            disabled={working}
            className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {working ? 'Adding dates…' : 'Add three more years'}
          </button>
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="rounded-lg border border-border px-4 py-2 font-display text-sm font-medium text-muted transition-colors hover:border-primary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {showList ? 'Hide the list' : `Show the ${expiring.length} ${expiring.length === 1 ? 'event' : 'events'}`}
          </button>
        </div>

        {/* Worth auditing before pressing anything: "fifty-one events" is a
            number an admin should be able to check rather than take on trust. */}
        {showList && (
          <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-border bg-background px-4 py-3">
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {expiring.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-1 font-sans text-sm text-muted">
                  <span className="truncate font-semibold text-foreground">{s.title}</span>
                  <span className="shrink-0 tabular-nums">{monthYear(s.last_date, MONTHS_SHORT)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
