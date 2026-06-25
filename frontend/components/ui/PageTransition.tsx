"use client"

import { useLayoutEffect, useState } from "react"
import { usePathname } from "@/i18n/routing"
import { peekLocaleSwitch, clearLocaleSwitch } from "@/lib/locale-transition"

// Uses key={pathname} to force React to remount this wrapper on every route
// change, which replays the CSS fade-in animation for a consistent page entry.
//
// Exception: a locale switch. That also remounts the whole [locale] subtree, but
// there the page content stays in place (same route, different language), so the
// fade + scroll-to-top read as a jarring full reload. When a switch is flagged
// we skip the fade and restore the pre-switch scroll position so it feels in-place.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Read once on mount (no side effect, SSR-safe) so the className is correct on
  // the very first paint. The actual clear happens in the effect below.
  const [localeSwitch] = useState(() => peekLocaleSwitch())

  useLayoutEffect(() => {
    if (!localeSwitch) return
    // Next.js scrolls to top on navigation; put the reader back where they were.
    window.scrollTo(0, localeSwitch.scrollY)
    clearLocaleSwitch()
    // Run once for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div key={pathname} className={localeSwitch ? "" : "animate-page-fade-in"}>
      {children}
    </div>
  )
}
