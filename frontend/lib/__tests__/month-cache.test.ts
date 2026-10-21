// Run with:  npm run test:month-cache
// (node's built-in runner + native TypeScript stripping - no test dependency)

import test from 'node:test'
import assert from 'node:assert/strict'

import { MonthCache, monthKey, shiftMonth } from '../month-cache.ts'
import type { CalendarMonthResponse } from '../../components/features/calendar/types.ts'

// A month payload with just enough shape to tell two apart.
function payload(tag: string): CalendarMonthResponse {
  return {
    events: [{ id: tag, date: '2026-10-01', title: tag, event_type: 'general', icon: 'star', color: 'rose' } as CalendarMonthResponse['events'][number]],
    month_note: null,
    year_content: null,
    month_settings: null,
  }
}

// A fetcher we can count and resolve by hand.
function fetcherStub(tag = 'data') {
  let calls = 0
  const fn = async (year: number, month: number) => {
    calls++
    return payload(`${tag}-${year}-${month}`)
  }
  return { fn, calls: () => calls }
}

const OCT = { year: 2026, month: 10, locale: 'en', admin: false }

test('monthKey separates locale and admin-ness; shiftMonth wraps the year', () => {
  assert.notEqual(monthKey(OCT), monthKey({ ...OCT, locale: 'vi' }))
  assert.notEqual(monthKey(OCT), monthKey({ ...OCT, admin: true }))
  assert.equal(monthKey(OCT), monthKey({ ...OCT }))
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftMonth(2026, 6, 0), { year: 2026, month: 6 })
})

test('read is null until load resolves, then returns the payload; fetcher runs once', async () => {
  const cache = new MonthCache()
  const f = fetcherStub()
  assert.equal(cache.read(OCT), null)
  const data = await cache.load(OCT, f.fn)
  assert.equal(data.events[0].id, 'data-2026-10')
  assert.equal(cache.read(OCT)?.events[0].id, 'data-2026-10')
  assert.equal(f.calls(), 1)
})

test('concurrent loads for the same key share one request', async () => {
  const cache = new MonthCache()
  const f = fetcherStub()
  await Promise.all([cache.load(OCT, f.fn), cache.load(OCT, f.fn), cache.load(OCT, f.fn)])
  assert.equal(f.calls(), 1)
})

test('load always revalidates but keeps the previous entry readable meanwhile', async () => {
  const cache = new MonthCache()
  const first = fetcherStub('first')
  await cache.load(OCT, first.fn)
  let release: (v: CalendarMonthResponse) => void = () => {}
  const slow = () => new Promise<CalendarMonthResponse>(r => { release = r })
  const pending = cache.load(OCT, slow)
  // Stale-while-revalidate: the old payload is still there during the refetch.
  assert.equal(cache.read(OCT)?.events[0].id, 'first-2026-10')
  release(payload('second'))
  await pending
  assert.equal(cache.read(OCT)?.events[0].id, 'second')
})

test('prefetch fetches only when nothing fresh is cached, and swallows failures', async () => {
  const cache = new MonthCache()
  const f = fetcherStub()
  await cache.prefetch(OCT, f.fn)
  await cache.prefetch(OCT, f.fn)
  assert.equal(f.calls(), 1, 'second prefetch must be a no-op on a fresh entry')
  const failing = async () => { throw new Error('network') }
  await assert.doesNotReject(() => cache.prefetch({ ...OCT, month: 11 }, failing))
  assert.equal(cache.read({ ...OCT, month: 11 }), null)
})

test('invalidateAll keeps data readable but makes prefetch refetch', async () => {
  const cache = new MonthCache()
  const f = fetcherStub()
  await cache.load(OCT, f.fn)
  cache.invalidateAll()
  assert.ok(cache.read(OCT), 'stale data must stay readable - nothing should vanish from the grid')
  await cache.prefetch(OCT, f.fn)
  assert.equal(f.calls(), 2, 'a stale entry is worth refetching')
})

test('patch merges into an existing entry and leaves the rest untouched', async () => {
  const cache = new MonthCache()
  const f = fetcherStub()
  await cache.load(OCT, f.fn)
  const settings = { year: 2026, month: 10, accent_color: '#8E1D5F' } as NonNullable<CalendarMonthResponse['month_settings']>
  cache.patch(OCT, { month_settings: settings })
  assert.equal(cache.read(OCT)?.month_settings?.accent_color, '#8E1D5F')
  assert.equal(cache.read(OCT)?.events[0].id, 'data-2026-10')
  // Patching a month that was never loaded is a no-op, not a phantom entry.
  cache.patch({ ...OCT, month: 3 }, { month_settings: settings })
  assert.equal(cache.read({ ...OCT, month: 3 }), null)
})

test('an admin can read the public entry as a stand-in; the public side never sees admin data', async () => {
  const cache = new MonthCache()
  const pub = fetcherStub('public')
  const adm = fetcherStub('admin')
  await cache.load(OCT, pub.fn)
  // Token just landed: no admin entry yet, so the public one stands in rather than a blank grid.
  assert.equal(cache.read({ ...OCT, admin: true })?.events[0].id, 'public-2026-10')
  await cache.load({ ...OCT, admin: true }, adm.fn)
  assert.equal(cache.read({ ...OCT, admin: true })?.events[0].id, 'admin-2026-10')
  // The other direction must never happen - admin payloads carry private fields.
  const fresh = new MonthCache()
  await fresh.load({ ...OCT, admin: true }, adm.fn)
  assert.equal(fresh.read(OCT), null)
})

test('subscribers hear about resolved loads and patches, and can unsubscribe', async () => {
  const cache = new MonthCache()
  let heard = 0
  const off = cache.subscribe(() => { heard++ })
  await cache.load(OCT, fetcherStub().fn)
  assert.equal(heard, 1)
  cache.patch(OCT, { month_note: null })
  assert.equal(heard, 2)
  off()
  await cache.load({ ...OCT, month: 11 }, fetcherStub().fn)
  assert.equal(heard, 2)
})

test('a failed load rejects and leaves the previous entry in place', async () => {
  const cache = new MonthCache()
  await cache.load(OCT, fetcherStub('good').fn)
  const failing = async () => { throw new Error('network') }
  await assert.rejects(() => cache.load(OCT, failing))
  assert.equal(cache.read(OCT)?.events[0].id, 'good-2026-10')
})

test('version advances on every change so a UI can subscribe to a number', async () => {
  const cache = new MonthCache()
  const v0 = cache.version()
  await cache.load(OCT, fetcherStub().fn)
  const v1 = cache.version()
  assert.ok(v1 > v0)
  cache.invalidateAll()
  assert.ok(cache.version() > v1)
})
