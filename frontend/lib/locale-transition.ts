// Locale switching is a route change (the locale is the top [locale] segment),
// so the whole subtree under it remounts. That remount otherwise (a) scrolls to
// top and (b) replays PageTransition's entry fade - which together make a
// language switch feel like a full reload. This module carries a one-shot
// signal across the remount so the new tree can restore the scroll position and
// skip the fade, making the switch feel in-place.

const KEY = 'locale-switch'

interface LocaleSwitchSignal {
  scrollY: number
  ts: number
}

// Called by LanguageSwitcher immediately before navigating to the new locale.
export function markLocaleSwitch(scrollY: number): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ scrollY, ts: Date.now() } satisfies LocaleSwitchSignal))
  } catch {
    // sessionStorage can throw in private-mode/quota edge cases - a failed
    // scroll restore is cosmetic, never worth crashing the switch over.
  }
}

// Read the signal WITHOUT clearing it. Used at render time to decide whether to
// skip the entry fade. Returns null when there is no recent signal, so it is
// safe to call in a useState initializer (idempotent, no side effects) and on
// the server (returns null -> no hydration mismatch). A staleness guard stops a
// leftover flag from a restored tab suppressing a legitimate fade. The window is
// 15s (not 5s) because the switch is a full document reload now: a cold backend
// or slow network can push the new page's mount past 5s, which would silently
// drop the saved scroll position.
export function peekLocaleSwitch(): { scrollY: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const sig = JSON.parse(raw) as LocaleSwitchSignal
    if (Date.now() - sig.ts > 15000) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return { scrollY: sig.scrollY }
  } catch {
    return null
  }
}

// Clear the signal once it has been consumed (called from an effect after the
// scroll is restored, so it only applies to a single switch).
export function clearLocaleSwitch(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
