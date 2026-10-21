'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { MonthCache, type MonthKeyParts } from './month-cache'
import { getMonth } from './calendar'
import type { CalendarMonthResponse } from '@/components/features/calendar/types'

// One store for the whole tab. Module-level so it outlives the shell remounting
// (the slide animation, an admin modal opening) and a revisited month is
// instant. It does not leak across languages: the locale switch is a hard
// navigation, and the key carries the locale anyway.
const store = new MonthCache()

// React face of MonthCache. The shell derives its month data from `read`
// instead of holding four useStates set after a fetch, which is what makes it
// impossible for one month's chips to render on another month's grid: the
// grid can only ever read the entry for the month it is showing.
export function useMonthCache(accessToken: string | null, locale: string) {
  const admin = !!accessToken

  // Subscribing to the version number (not the entries) keeps every `read` in
  // a render consistent with the snapshot React took for that render.
  useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), []),
    () => store.version(),
    () => 0,
  )

  const parts = useCallback(
    (year: number, month: number): MonthKeyParts => ({ year, month, locale, admin }),
    [locale, admin],
  )
  const fetcher = useCallback(
    (year: number, month: number) => getMonth(year, month, accessToken, locale),
    [accessToken, locale],
  )

  const read = useCallback((year: number, month: number) => store.read(parts(year, month)), [parts])
  const load = useCallback((year: number, month: number) => store.load(parts(year, month), fetcher), [parts, fetcher])
  const prefetch = useCallback((year: number, month: number) => store.prefetch(parts(year, month), fetcher), [parts, fetcher])
  const patch = useCallback(
    (year: number, month: number, partial: Partial<CalendarMonthResponse>) => store.patch(parts(year, month), partial),
    [parts],
  )
  const invalidateAll = useCallback(() => store.invalidateAll(), [])

  return useMemo(() => ({ read, load, prefetch, patch, invalidateAll }), [read, load, prefetch, patch, invalidateAll])
}
