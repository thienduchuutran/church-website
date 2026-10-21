import type { CalendarMonthResponse } from '@/components/features/calendar/types'

// The calendar's month store, framework-free so `npm run test:month-cache` can
// drive it without React. `useMonthCache` (use-month-cache.ts) is the hook
// around one shared instance.
//
// Why this exists: every month used to be fetched when viewed and forgotten
// when left - swiping Oct -> Nov -> Oct was three round-trips, each one dimming
// the grid. Google Calendar feels instant because its screen renders from a
// local copy of the data and the network's only job is to keep that copy
// fresh. This is that copy, scaled to a church calendar: a Map in memory, not a
// synced database.
//
// Three rules, each tested:
//   - Stale-while-revalidate. `load` always refetches but never removes what is
//     already there, so a grid never goes blank while a fresher copy is on its
//     way. `invalidateAll` marks entries stale rather than deleting them for
//     the same reason.
//   - The key carries locale and admin-ness. Vietnamese is a different
//     payload, and an admin's payload carries private fields a public viewer
//     must never see - keeping both in the key means they cannot cross.
//   - A public entry may stand in for a missing admin one (the token just
//     landed; showing the public subset for 300ms beats a blank grid). The
//     reverse is never allowed.

export interface MonthKeyParts {
  year: number
  month: number
  locale: string
  admin: boolean
}

export type MonthFetcher = (year: number, month: number) => Promise<CalendarMonthResponse>

interface Entry {
  data: CalendarMonthResponse
  stale: boolean
}

export function monthKey({ year, month, locale, admin }: MonthKeyParts): string {
  return `${year}-${String(month).padStart(2, '0')}-${locale}-${admin ? 'admin' : 'public'}`
}

// Pure month arithmetic for neighbour prefetching. `delta` is in months and may
// be negative; the year wraps.
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 }
}

export class MonthCache {
  private entries = new Map<string, Entry>()
  // One request per key at a time: a fast arrow double-tap or the token
  // landing mid-flight must not fan out into duplicate fetches.
  private inflight = new Map<string, Promise<CalendarMonthResponse>>()
  private listeners = new Set<() => void>()
  private tick = 0

  // A number that advances on every change. React subscribes to this through
  // useSyncExternalStore; reads in the same render are then consistent with it.
  version(): number {
    return this.tick
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    this.tick++
    for (const l of this.listeners) l()
  }

  read(parts: MonthKeyParts): CalendarMonthResponse | null {
    const exact = this.entries.get(monthKey(parts))
    if (exact) return exact.data
    // Admin-only stand-in: the public payload is a strict subset, so showing it
    // until the admin copy arrives leaks nothing. Never the other way round.
    if (parts.admin) {
      const pub = this.entries.get(monthKey({ ...parts, admin: false }))
      if (pub) return pub.data
    }
    return null
  }

  private isFresh(parts: MonthKeyParts): boolean {
    const e = this.entries.get(monthKey(parts))
    return !!e && !e.stale
  }

  // Fetch (deduplicated) and store. The previous entry stays readable until the
  // new one replaces it; on failure it stays, full stop.
  load(parts: MonthKeyParts, fetcher: MonthFetcher): Promise<CalendarMonthResponse> {
    const key = monthKey(parts)
    const running = this.inflight.get(key)
    if (running) return running
    const request = fetcher(parts.year, parts.month)
      .then((data) => {
        this.entries.set(key, { data, stale: false })
        this.notify()
        return data
      })
      .finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, request)
    return request
  }

  // Warm a month the visitor is likely to look at next. Skips anything fresh or
  // already in flight; a failure is nobody's problem until they actually go there.
  async prefetch(parts: MonthKeyParts, fetcher: MonthFetcher): Promise<void> {
    if (this.isFresh(parts) || this.inflight.has(monthKey(parts))) return
    try {
      await this.load(parts, fetcher)
    } catch {
      // Swallowed on purpose - see above.
    }
  }

  // Merge a partial payload into an existing entry - the accent picker saves
  // month_settings and wants it on screen without a round-trip. A month that
  // was never loaded gets nothing: a phantom entry with no events would render
  // as an empty month.
  patch(parts: MonthKeyParts, partial: Partial<CalendarMonthResponse>): void {
    const key = monthKey(parts)
    const existing = this.entries.get(key)
    if (!existing) return
    this.entries.set(key, { data: { ...existing.data, ...partial }, stale: existing.stale })
    this.notify()
  }

  // After any write. A repeating series or a multi-day span can change months
  // other than the one on screen, so everything is marked stale - but nothing
  // is removed, because stale data on screen beats a blank grid, and the next
  // load/prefetch of each month replaces it.
  invalidateAll(): void {
    for (const e of this.entries.values()) e.stale = true
    this.notify()
  }
}
