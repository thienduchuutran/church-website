"use client"

import { useLayoutEffect, useState } from "react"
import { usePathname } from "@/i18n/routing"
import { peekLocaleSwitch, clearLocaleSwitch } from "@/lib/locale-transition"

// Uses key={pathname} to force React to remount this wrapper on every route
// change, which replays the CSS fade-in animation for a consistent page entry.
//
// Exception: a locale switch. The switch is a full document reload (see
// LanguageSwitcher), so the new page would otherwise enter with a fade +
// scroll-to-top that read as a jarring reload. When the switch signal is present
// we skip the fade and restore the pre-switch scroll position so it feels
// in-place.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // MUST start false so the first client render matches the server HTML. The
  // server has no sessionStorage, so it always renders the fade; reading the
  // switch signal in a useState initializer instead would make the first client
  // paint differ -> hydration mismatch. After a hard-nav switch that mismatch
  // fired every time, because the signal is sitting in sessionStorage during
  // hydration. We instead detect the signal in a layout effect - it runs before
  // paint, so dropping the fade + restoring scroll there is invisible and
  // mismatch-free.
  const [skipFade, setSkipFade] = useState(false)

  useLayoutEffect(() => {
    const sig = peekLocaleSwitch()
    if (!sig) return
    setSkipFade(true)
    clearLocaleSwitch()

    // Restore the pre-switch scroll position. On a full document reload the page
    // content (images, backend data) can arrive AFTER first paint and grow the
    // document, so a single scrollTo would run before the page is tall enough to
    // reach the saved position - which is why the restore looked flaky "after a
    // certain times". Re-apply the target each frame until the document can
    // actually reach it (or a short deadline passes), then stop.
    const targetY = sig.scrollY
    const deadline = Date.now() + 1200
    let raf = 0
    const apply = () => {
      window.scrollTo(0, targetY)
      const canReach = document.documentElement.scrollHeight - window.innerHeight >= targetY
      if (!canReach && Date.now() < deadline) {
        raf = requestAnimationFrame(apply)
      }
    }
    apply()
    return () => cancelAnimationFrame(raf)
    // Run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div key={pathname} className={skipFade ? "" : "animate-page-fade-in"}>
      {children}
    </div>
  )
}
