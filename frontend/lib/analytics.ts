// First-party, cookie-free usage analytics - the browser half.
//
// What this file does NOT do is as important as what it does. It sets no
// cookie, stores no identifier that outlives the tab, and sends no name,
// email or user id. The server derives a daily-rotating visitor hash from the
// request itself; the browser only reports *what* happened, *where*, and how
// long the page was actually visible.
//
// Two layers, so the logic is unit-testable under node without a DOM:
//
//   Tracker          pure: queueing, batching, retry with backoff, session id,
//                    the `returning` flag, visible-time accounting. Talks to
//                    the outside world only through the injected Transport
//                    and Store interfaces.
//   getTracker()     browser glue: wires window/localStorage/fetch into one
//                    shared Tracker. Components call track(); TrackerMount
//                    drives page views.
//
// Why retry + persist: the Go backend sleeps on Render's free tier and takes
// ~50 s to wake. Events sent during that window would otherwise vanish. A
// failed batch is written to localStorage and re-sent on the next flush or
// the next visit. Batches sent on pagehide are best-effort - there is no
// "after" in which to persist a failure.
//
// Run the tests with: npm run test:analytics

export type AnalyticsEventName =
  | 'page_view'
  | 'page_leave'
  | 'post_read'
  | 'locale_switch'
  | 'calendar_month_view'
  | 'calendar_event_open'
  | 'gallery_album_open'
  | 'reaction_add'
  | 'outbound_click'

// Keys the backend accepts in `props`. Anything else is a 400 - the server
// list in model.AnalyticsPropKeys is the source of truth; keep in sync.
export type AnalyticsProps = Partial<{
  post_id: string
  event_id: string
  album_id: string
  from: string
  to: string
  month: string
  host: string
  emoji: string
  tag: string
}>

export interface AnalyticsEvent {
  name: AnalyticsEventName
  path: string
  locale: string
  session_id: string
  occurred_at: number
  referrer?: string
  duration_ms?: number
  returning: boolean
  props?: AnalyticsProps
}

// is_admin is legacy. New bundles no longer send it: the server decides who
// sent a batch from the verified Supabase token in the Authorization header.
export interface AnalyticsBatch {
  is_admin?: boolean
  events: AnalyticsEvent[]
}

// A minimal key/value store; localStorage and sessionStorage both satisfy it,
// and the tests pass a Map-backed one.
export interface Store {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

// Sends one batch. Resolves true when the server accepted it. `final` marks a
// pagehide flush, where the transport should use a fire-and-forget method.
// `token` is the signed-in visitor's Supabase access token, or null.
export type Transport = (batch: AnalyticsBatch, final: boolean, token: string | null) => Promise<boolean>

// Auth state as the tracker sees it. While 'unknown' nothing is sent: the
// first batch of a signed-in admin must carry the token, or the server
// cannot tell it apart from a visitor. That exact leak happened on the first
// production day.
export type TrackerAuth = 'unknown' | { token: string | null }

export interface TrackerDeps {
  transport: Transport
  local: Store
  session: Store
  now?: () => number
  randomId?: () => string
  // Hook for the browser shell to defer a flush; tests call flush() directly.
  schedule?: (fn: () => void, ms: number) => void
  // Start with auth unknown and hold flushes until setAuth() is called (or
  // AUTH_HOLD_MAX_MS passes). The browser shell sets this; tests default to
  // resolved-anonymous so the queue behaviour can be tested on its own.
  holdForAuth?: boolean
}

export const MAX_BATCH = 20
export const MAX_PERSISTED = 200
export const FLUSH_INTERVAL_MS = 5_000
export const SESSION_IDLE_MS = 30 * 60 * 1000
export const RETURNING_WINDOW_DAYS = 30
// If auth has not resolved by then, send as anonymous rather than lose the
// events. A signed-in admin whose auth took longer than this is counted as
// public for that one batch - the lesser evil.
export const AUTH_HOLD_MAX_MS = 10_000

const KEY_QUEUE = 'vgomne_analytics_queue'
const KEY_LAST_VISIT = 'vgomne_last_visit'
const KEY_SESSION = 'vgomne_sid'
const KEY_SESSION_AT = 'vgomne_sid_at'

function fallbackRandomId(): string {
  // crypto.randomUUID exists in every browser that runs this app; the
  // fallback only matters under node tests.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// computeReturning answers "has this browser been here before, on another
// day, recently?" from a stored date string alone. No identifier is needed,
// which is why the server cannot derive it and the client must.
export function computeReturning(lastVisit: string | null, today: string): boolean {
  if (!lastVisit || lastVisit === today) return false
  const last = Date.parse(lastVisit)
  const now = Date.parse(today)
  if (Number.isNaN(last) || Number.isNaN(now)) return false
  const days = (now - last) / 86_400_000
  return days > 0 && days <= RETURNING_WINDOW_DAYS
}

// externalReferrerHost keeps only cross-site referrers. Same-site navigation
// is not a referral, and the server stores only the host anyway.
export function externalReferrer(referrer: string, ownHost: string): string | undefined {
  if (!referrer) return undefined
  try {
    const u = new URL(referrer)
    if (u.host === ownHost) return undefined
    return u.origin
  } catch {
    return undefined
  }
}

interface Context {
  locale: string
}

export class Tracker {
  private queue: AnalyticsEvent[] = []
  private ctx: Context = { locale: 'en' }
  private auth: TrackerAuth = { token: null }
  private flushing = false
  private failures = 0
  private nextAllowedAt = 0
  private disabled = false

  // Visible-time accounting for the current page.
  private currentPath: string | null = null
  private visibleSince: number | null = null
  private accumulatedMs = 0
  private referrerSent = false

  private readonly deps: TrackerDeps
  private readonly now: () => number
  private readonly randomId: () => string
  private readonly schedule?: (fn: () => void, ms: number) => void

  // A plain field assignment rather than a TS parameter property: node's
  // --experimental-strip-types runner (npm run test:analytics) cannot strip
  // parameter properties.
  constructor(deps: TrackerDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => Date.now())
    this.randomId = deps.randomId ?? fallbackRandomId
    this.schedule = deps.schedule
    if (deps.holdForAuth) {
      this.auth = 'unknown'
      this.schedule?.(() => {
        if (this.auth === 'unknown') this.setAuth({ token: null })
      }, AUTH_HOLD_MAX_MS)
    }
    this.restorePersisted()
  }

  // Context is set by TrackerMount from next-intl. Locale is stamped on
  // every event.
  setContext(ctx: Partial<Context>) {
    this.ctx = { ...this.ctx, ...ctx }
  }

  // setAuth is called by TrackerMount once useAuth knows whether there is a
  // session. Resolving releases any held flush. The token travels in the
  // Authorization header; the server verifies it and decides the audience.
  setAuth(state: TrackerAuth) {
    this.auth = state
    if (state !== 'unknown' && this.queue.length > 0) {
      this.schedule?.(() => void this.flush(), 0)
    }
  }

  get authResolved(): boolean {
    return this.auth !== 'unknown'
  }

  private token(): string | null {
    return this.auth === 'unknown' ? null : this.auth.token
  }

  // disable() is the dev switch (NEXT_PUBLIC_ANALYTICS_DISABLED=1). Nothing
  // is queued and nothing already queued is sent.
  disable() {
    this.disabled = true
    this.queue = []
  }

  get pending(): number {
    return this.queue.length
  }

  // ---- session + returning ------------------------------------------------

  sessionId(): string {
    const now = this.now()
    const sid = this.deps.session.get(KEY_SESSION)
    const at = Number(this.deps.session.get(KEY_SESSION_AT) ?? 0)
    if (sid && at && now - at < SESSION_IDLE_MS) {
      this.deps.session.set(KEY_SESSION_AT, String(now))
      return sid
    }
    const fresh = this.randomId()
    this.deps.session.set(KEY_SESSION, fresh)
    this.deps.session.set(KEY_SESSION_AT, String(now))
    this.referrerSent = false
    return fresh
  }

  // Reads and then advances the last-visit date. Called once per page view;
  // the first page view of a day is the one that flips the stored date, so
  // every page view that day reports the same answer.
  private returningToday(): boolean {
    const today = isoDay(this.now())
    const last = this.deps.local.get(KEY_LAST_VISIT)
    const returning = computeReturning(last, today)
    if (last !== today) {
      // Remember what we decided for the rest of the day so later page
      // views do not see today's date and report false.
      this.deps.session.set('vgomne_returning', returning ? '1' : '0')
      this.deps.local.set(KEY_LAST_VISIT, today)
    }
    const cached = this.deps.session.get('vgomne_returning')
    return cached === null ? returning : cached === '1'
  }

  // ---- events -------------------------------------------------------------

  track(name: AnalyticsEventName, path: string, props?: AnalyticsProps, extra?: { duration_ms?: number; referrer?: string }) {
    if (this.disabled) return
    const ev: AnalyticsEvent = {
      name,
      path,
      locale: this.ctx.locale,
      session_id: this.sessionId(),
      occurred_at: this.now(),
      returning: name === 'page_view' ? this.returningToday() : false,
    }
    if (props && Object.keys(props).length > 0) ev.props = props
    if (extra?.duration_ms !== undefined) ev.duration_ms = Math.max(0, Math.round(extra.duration_ms))
    if (extra?.referrer) ev.referrer = extra.referrer
    this.queue.push(ev)
    if (this.queue.length >= MAX_BATCH) {
      void this.flush()
    } else {
      this.schedule?.(() => void this.flush(), FLUSH_INTERVAL_MS)
    }
  }

  // pageView closes the previous page (emitting page_leave with its visible
  // time) and opens a new one. The referrer is attached only to the first
  // page view of a session - that is the one that answers "where did they
  // come from".
  pageView(path: string, referrer?: string) {
    if (this.disabled) return
    this.closePage()
    this.currentPath = path
    this.accumulatedMs = 0
    this.visibleSince = this.now()
    const sid = this.sessionId()
    void sid
    const extra: { referrer?: string } = {}
    if (referrer && !this.referrerSent) {
      extra.referrer = referrer
      this.referrerSent = true
    }
    this.track('page_view', path, undefined, extra)
  }

  // Visibility drives the duration clock: only time the tab is in the
  // foreground counts, so a phone left on the lock screen does not report an
  // eight-hour read.
  setVisible(visible: boolean) {
    const now = this.now()
    if (visible) {
      if (this.visibleSince === null && this.currentPath) this.visibleSince = now
    } else if (this.visibleSince !== null) {
      this.accumulatedMs += now - this.visibleSince
      this.visibleSince = null
    }
  }

  private closePage() {
    if (!this.currentPath) return
    this.setVisible(false)
    this.track('page_leave', this.currentPath, undefined, { duration_ms: this.accumulatedMs })
    this.currentPath = null
    this.accumulatedMs = 0
  }

  // ---- sending ------------------------------------------------------------

  // flush sends up to MAX_BATCH events. On failure the batch goes back to
  // the front of the queue and to localStorage, and the next attempt waits
  // 5 s, 10 s, 20 s ... up to 60 s so a sleeping backend is not hammered.
  async flush(): Promise<void> {
    if (this.disabled || this.flushing || this.queue.length === 0) return
    if (this.auth === 'unknown') return
    if (this.now() < this.nextAllowedAt) {
      this.schedule?.(() => void this.flush(), this.nextAllowedAt - this.now())
      return
    }
    this.flushing = true
    const batch = this.queue.splice(0, MAX_BATCH)
    let ok = false
    try {
      ok = await this.deps.transport({ events: batch }, false, this.token())
    } catch {
      ok = false
    }
    this.flushing = false
    if (ok) {
      this.failures = 0
      this.nextAllowedAt = 0
      this.persist()
      if (this.queue.length > 0) this.schedule?.(() => void this.flush(), 0)
      return
    }
    this.queue.unshift(...batch)
    this.failures += 1
    const backoff = Math.min(60_000, FLUSH_INTERVAL_MS * 2 ** (this.failures - 1))
    this.nextAllowedAt = this.now() + backoff
    this.persist()
    this.schedule?.(() => void this.flush(), backoff)
  }

  // finalFlush is for pagehide: close the page, hand everything to the
  // fire-and-forget transport, and persist a copy ONLY of what was already
  // persisted-worthy (older failures). The current batch is not persisted:
  // we cannot learn whether the beacon landed, and re-sending it next visit
  // would double count.
  finalFlush(): void {
    if (this.disabled) return
    this.closePage()
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0, MAX_BATCH)
    void this.deps.transport({ events: batch }, true, this.token()).catch(() => undefined)
    this.persist()
  }

  // ---- persistence --------------------------------------------------------

  private persist() {
    try {
      if (this.queue.length === 0) {
        this.deps.local.remove(KEY_QUEUE)
        return
      }
      const keep = this.queue.slice(-MAX_PERSISTED)
      this.deps.local.set(KEY_QUEUE, JSON.stringify(keep))
    } catch {
      // Quota or privacy mode: losing the retry copy is acceptable.
    }
  }

  private restorePersisted() {
    try {
      const raw = this.deps.local.get(KEY_QUEUE)
      if (!raw) return
      const parsed = JSON.parse(raw) as AnalyticsEvent[]
      if (Array.isArray(parsed)) {
        this.queue.push(...parsed.slice(-MAX_PERSISTED))
      }
      this.deps.local.remove(KEY_QUEUE)
    } catch {
      this.deps.local.remove(KEY_QUEUE)
    }
  }
}

// ---------------------------------------------------------------------------
// Browser shell
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const ENDPOINT = `${API_URL}/api/v1/analytics/events`

function webStore(storage: globalThis.Storage | undefined): Store {
  // Every access is guarded: Safari private mode and some embedded browsers
  // throw on touch, and analytics must never break a page.
  return {
    get: (k) => {
      try {
        return storage?.getItem(k) ?? null
      } catch {
        return null
      }
    },
    set: (k, v) => {
      try {
        storage?.setItem(k, v)
      } catch {
        /* ignore */
      }
    },
    remove: (k) => {
      try {
        storage?.removeItem(k)
      } catch {
        /* ignore */
      }
    },
  }
}

// Periodic flushes use fetch so the response is known and a failure can be
// persisted. The pagehide flush uses fetch with keepalive, which the browser
// lets finish after the document is gone; sendBeacon would too, but cannot
// carry a JSON content type on every browser.
const browserTransport: Transport = async (batch, final, token) => {
  const body = JSON.stringify(batch)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  if (final) {
    try {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body,
        keepalive: true,
      })
      return true
    } catch {
      return false
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      signal: controller.signal,
    })
    // 4xx means the payload is wrong and retrying cannot help; drop it.
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let singleton: Tracker | null = null

// getTracker returns the one shared tracker for this tab, or null during SSR.
export function getTracker(): Tracker | null {
  if (typeof window === 'undefined') return null
  if (singleton) return singleton
  singleton = new Tracker({
    transport: browserTransport,
    local: webStore(window.localStorage),
    session: webStore(window.sessionStorage),
    schedule: (fn, ms) => {
      window.setTimeout(fn, ms)
    },
    holdForAuth: true,
  })
  if (process.env.NEXT_PUBLIC_ANALYTICS_DISABLED === '1') {
    singleton.disable()
  }
  return singleton
}

// track is the one-liner components call. Path is the current browser
// pathname (locale prefix included - the server strips it).
export function track(name: AnalyticsEventName, props?: AnalyticsProps) {
  const t = getTracker()
  if (!t) return
  t.track(name, window.location.pathname, props)
}

// flushNow is for the moment before a hard navigation (the language switcher
// reloads the document), when a scheduled flush would never run.
export function flushNow() {
  getTracker()?.finalFlush()
}
