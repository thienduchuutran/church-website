'use client'

import { useEffect } from 'react'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { externalReferrer, getTracker } from '@/lib/analytics'

// TrackerMount is the one client island that drives page-level analytics.
// It renders nothing. Mounted once in app/[locale]/layout.tsx so every page in
// both locales is covered without any page knowing analytics exists.
//
// Why next/navigation's usePathname and not next-intl's: the raw pathname
// includes the /vi prefix, which is what the server normalises away while
// reading the locale from the separate `locale` field. Using the stripped
// version would make the two disagree on nothing, but the raw one is also
// what window.location shows, so the numbers match what a visitor sees.
export default function TrackerMount() {
  const pathname = usePathname()
  const locale = useLocale()
  const { session, loading, hint } = useAuth()

  useEffect(() => {
    const t = getTracker()
    if (!t) return
    t.setContext({ locale })
  }, [locale])

  // The tracker starts with auth unknown and sends nothing until told. A
  // returning signed-out visitor is released on first paint via the session
  // storage hint, so public visitors never wait. A signed-in browser waits
  // for the real session so its first batch carries the token - the server
  // decides admin/public/excluded from that, never from a client flag.
  useEffect(() => {
    const t = getTracker()
    if (!t) return
    if (!loading) {
      t.setAuth({ token: session?.access_token ?? null })
      return
    }
    if (hint && !hint.signedIn) {
      t.setAuth({ token: null })
    }
  }, [loading, session, hint])

  // One page view per route change. document.referrer is only meaningful
  // on the first page of a session; the tracker enforces that, this just
  // passes it along when it is cross-site.
  useEffect(() => {
    const t = getTracker()
    if (!t || !pathname) return
    t.pageView(window.location.pathname, externalReferrer(document.referrer, window.location.host))
  }, [pathname])

  // Visibility and unload wiring, registered once per tab.
  useEffect(() => {
    const t = getTracker()
    if (!t) return
    const onVisibility = () => t.setVisible(document.visibilityState === 'visible')
    // pagehide fires on both tab close and bfcache entry; pageshow with
    // `persisted` means we came back from bfcache and must reopen the page.
    const onHide = () => t.finalFlush()
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) t.pageView(window.location.pathname)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    // Anything persisted from a previous visit goes out now.
    void t.flush()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  return null
}
