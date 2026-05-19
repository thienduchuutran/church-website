import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'

// Locales supported across the site. `en` is the source of truth for content
// stored in the database; `vi` is served via the translation engine
// (backend/internal/translation/...). To add a third locale here, also widen
// the backend's `SUPPORTED_LOCALES` env var and seed a system prompt row in
// `system_prompts` for it.
export const routing = defineRouting({
  locales: ['en', 'vi'],
  defaultLocale: 'en',
  // 'as-needed' means the default locale (en) is served at /, /events, /about
  // - no /en prefix. Vietnamese is served at /vi, /vi/events, /vi/about. The
  // tradeoff: the canonical URL for English visitors stays clean. The cost:
  // we cannot share a URL with another locale's translation without manually
  // adding the prefix; users switch language via the Navbar switcher (Phase 4c).
  localePrefix: 'as-needed',
  // Persist the user's last choice in a cookie so a visitor who picks Vietnamese
  // does not get bounced back to English on the next page navigation.
  localeCookie: {
    name: 'NEXT_LOCALE',
  },
})

// These are the locale-aware navigation primitives. Use them instead of
// `next/link` and `next/navigation` everywhere - they auto-prefix the current
// locale onto every URL so internal navigation stays inside the chosen
// language without each call site having to remember to do that.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)

export type Locale = (typeof routing.locales)[number]
