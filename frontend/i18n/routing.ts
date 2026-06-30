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
  // 'always' prefixes EVERY locale: English at /en, /en/events; Vietnamese at
  // /vi, /vi/events; bare / redirects to /en. We deliberately moved off
  // 'as-needed' (which left English unprefixed) because that asymmetry was the
  // root of a cascade of language-switch bugs: switching to the unprefixed
  // default reused the cached [locale] layout (stale useLocale -> frozen
  // switcher), next-intl's usePathname() failed to strip the prefix in a prod
  // build, and the locale at '/' was ambiguous. With every locale prefixed the
  // URL is the single, unambiguous source of truth, so that whole class of bugs
  // disappears. Cost: English URLs now carry an /en prefix (the canonical URL),
  // and bare / 301s to /en. See docs/ideas/smooth-locale-switching.md.
  localePrefix: 'always',
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
