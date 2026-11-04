// Run with:  npm run test:analytics
// (node's built-in runner + native TypeScript stripping - no test dependency)

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  Tracker,
  computeReturning,
  externalReferrer,
  MAX_BATCH,
  MAX_PERSISTED,
  SESSION_IDLE_MS,
  type AnalyticsBatch,
  type Store,
} from '../analytics.ts'

function memStore(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  }
}

function harness(opts: { accept?: boolean | (() => boolean) } = {}) {
  const sent: { batch: AnalyticsBatch; final: boolean }[] = []
  let clock = Date.parse('2026-10-28T15:00:00Z')
  const local = memStore()
  const session = memStore()
  let counter = 0
  const tracker = new Tracker({
    transport: async (batch, final) => {
      sent.push({ batch, final })
      const a = opts.accept ?? true
      return typeof a === 'function' ? a() : a
    },
    local,
    session,
    now: () => clock,
    randomId: () => `id-${++counter}`,
  })
  return {
    tracker,
    sent,
    local,
    session,
    advance: (ms: number) => {
      clock += ms
    },
    at: (iso: string) => {
      clock = Date.parse(iso)
    },
  }
}

test('computeReturning: only a different day within 30 days counts', () => {
  assert.equal(computeReturning(null, '2026-10-28'), false)
  assert.equal(computeReturning('2026-10-28', '2026-10-28'), false)
  assert.equal(computeReturning('2026-10-27', '2026-10-28'), true)
  assert.equal(computeReturning('2026-09-29', '2026-10-28'), true)
  assert.equal(computeReturning('2026-09-01', '2026-10-28'), false)
  assert.equal(computeReturning('garbage', '2026-10-28'), false)
})

test('externalReferrer drops same-site and keeps only the origin', () => {
  assert.equal(externalReferrer('', 'vgomne.org'), undefined)
  assert.equal(externalReferrer('https://vgomne.org/events', 'vgomne.org'), undefined)
  assert.equal(externalReferrer('https://m.facebook.com/groups/1?x=y', 'vgomne.org'), 'https://m.facebook.com')
  assert.equal(externalReferrer('not a url', 'vgomne.org'), undefined)
})

test('page views are stamped with locale, a session id and the returning flag', async () => {
  const h = harness()
  h.local.set('vgomne_last_visit', '2026-10-27')
  h.tracker.setContext({ locale: 'vi' })

  h.tracker.pageView('/vi/events', 'https://facebook.com')
  h.tracker.pageView('/vi/calendar')

  assert.equal(h.tracker.pending, 3) // view, leave, view
  await h.tracker.flush()
  const [view, leave, view2] = h.sent[0].batch.events
  assert.equal(view.name, 'page_view')
  assert.equal(view.locale, 'vi')
  assert.equal(view.returning, true)
  assert.equal(view.session_id, 'id-1')
  assert.equal(leave.name, 'page_leave')
  assert.equal(leave.path, '/vi/events')
  assert.equal(view2.session_id, view.session_id)
  assert.equal(view2.returning, true)
})

test('flush sends at most MAX_BATCH and drains the rest on later flushes', async () => {
  const h = harness()
  for (let i = 0; i < MAX_BATCH + 5; i++) h.tracker.track('post_read', '/events', { post_id: `p${i}` })
  // Reaching MAX_BATCH triggers an automatic flush inside track().
  await Promise.resolve()
  await h.tracker.flush()
  await h.tracker.flush()
  const total = h.sent.reduce((n, s) => n + s.batch.events.length, 0)
  assert.equal(total, MAX_BATCH + 5)
  for (const s of h.sent) assert.ok(s.batch.events.length <= MAX_BATCH)
  assert.equal(h.tracker.pending, 0)
})

test('a failed flush re-queues the batch, persists it, and backs off', async () => {
  let accept = false
  const h = harness({ accept: () => accept })
  h.tracker.track('reaction_add', '/events', { emoji: '👍' })

  await h.tracker.flush()
  assert.equal(h.tracker.pending, 1, 'event goes back on the queue')
  const persisted = JSON.parse(h.local.get('vgomne_analytics_queue') ?? '[]')
  assert.equal(persisted.length, 1, 'and is written to localStorage for the next visit')

  // Immediately retrying is refused (backoff), nothing new is sent.
  await h.tracker.flush()
  assert.equal(h.sent.length, 1)

  accept = true
  h.advance(6_000)
  await h.tracker.flush()
  assert.equal(h.sent.length, 2)
  assert.equal(h.tracker.pending, 0)
  assert.equal(h.local.get('vgomne_analytics_queue'), null, 'persisted copy cleared after success')
})

test('a persisted queue from a previous visit is restored and capped', () => {
  const local = memStore()
  const events = Array.from({ length: MAX_PERSISTED + 50 }, (_, i) => ({
    name: 'page_view',
    path: `/p${i}`,
    locale: 'en',
    session_id: 'old-session',
    occurred_at: 1,
    returning: false,
  }))
  local.set('vgomne_analytics_queue', JSON.stringify(events))
  const tracker = new Tracker({ transport: async () => true, local, session: memStore() })
  assert.equal(tracker.pending, MAX_PERSISTED)
  assert.equal(local.get('vgomne_analytics_queue'), null)
})

test('session id persists across events and renews after 30 idle minutes', () => {
  const h = harness()
  const a = h.tracker.sessionId()
  h.advance(10 * 60 * 1000)
  const b = h.tracker.sessionId()
  assert.equal(a, b)
  h.advance(SESSION_IDLE_MS + 1)
  const c = h.tracker.sessionId()
  assert.notEqual(a, c)
})

test('page_leave carries only the time the tab was visible', async () => {
  const h = harness()
  h.tracker.pageView('/events')
  h.advance(4_000) // visible 4 s
  h.tracker.setVisible(false)
  h.advance(60_000) // backgrounded for a minute - must not count
  h.tracker.setVisible(true)
  h.advance(1_000) // visible 1 s more
  h.tracker.pageView('/calendar')

  await h.tracker.flush()
  const leave = h.sent[0].batch.events.find((e) => e.name === 'page_leave')
  assert.ok(leave)
  assert.equal(leave?.path, '/events')
  assert.equal(leave?.duration_ms, 5_000)
})

test('returning is true on the first visit of a later day, and stable all day', async () => {
  const h = harness()
  h.at('2026-10-27T12:00:00Z')
  h.tracker.pageView('/')
  await h.tracker.flush()
  assert.equal(h.sent[0].batch.events[0].returning, false, 'first ever visit')

  h.at('2026-10-28T12:00:00Z')
  // New tab-session on the next day.
  const h2 = harness()
  h2.local.set('vgomne_last_visit', '2026-10-27')
  h2.at('2026-10-28T12:00:00Z')
  h2.tracker.pageView('/')
  h2.tracker.pageView('/events')
  await h2.tracker.flush()
  const views = h2.sent[0].batch.events.filter((e) => e.name === 'page_view')
  assert.deepEqual(
    views.map((v) => v.returning),
    [true, true],
    'second page view the same day must not flip to false just because the date was advanced',
  )
  assert.equal(h2.local.get('vgomne_last_visit'), '2026-10-28')
})

test('the referrer is attached to the first page view of a session only', async () => {
  const h = harness()
  h.tracker.pageView('/', 'https://facebook.com')
  h.tracker.pageView('/events', 'https://facebook.com')
  await h.tracker.flush()
  const views = h.sent[0].batch.events.filter((e) => e.name === 'page_view')
  assert.equal(views[0].referrer, 'https://facebook.com')
  assert.equal(views[1].referrer, undefined)
})

test('admin context travels on the batch, not on each event', async () => {
  const h = harness()
  h.tracker.setContext({ isAdmin: true })
  h.tracker.track('page_view', '/admin')
  await h.tracker.flush()
  assert.equal(h.sent[0].batch.is_admin, true)
  assert.equal('is_admin' in h.sent[0].batch.events[0], false)
})

test('finalFlush closes the page and uses the fire-and-forget path', () => {
  const h = harness()
  h.tracker.pageView('/events')
  h.advance(2_000)
  h.tracker.finalFlush()
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].final, true)
  const names = h.sent[0].batch.events.map((e) => e.name)
  assert.deepEqual(names, ['page_view', 'page_leave'])
})

test('disable() drops everything and ignores later calls', async () => {
  const h = harness()
  h.tracker.track('page_view', '/')
  h.tracker.disable()
  h.tracker.track('page_view', '/events')
  await h.tracker.flush()
  assert.equal(h.sent.length, 0)
  assert.equal(h.tracker.pending, 0)
})
