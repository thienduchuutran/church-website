'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { routing, type Locale } from '@/i18n/routing'
import { markLocaleSwitch } from '@/lib/locale-transition'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

// Strip a leading locale segment (`/vi`, `/en`) from a raw pathname, returning a
// locale-agnostic path that always starts with `/`. Deliberately computed OFF
// next-intl: under `localePrefix: 'as-needed'` in a prod build, next-intl's
// usePathname() does not reliably strip the prefix, which silently broke the
// switch back to the default locale (see switchTo for the full story).
function stripLocalePrefix(path: string): string {
  for (const loc of routing.locales) {
    if (path === `/${loc}`) return '/'
    if (path.startsWith(`/${loc}/`)) return path.slice(loc.length + 1)
  }
  return path
}

// Each language is labelled in ITSELF, not translated and not a flag. A
// reader who cannot read the current page must still recognise their own
// language, and a flag names a country, not a language - for a Southern
// Vietnamese diaspora congregation either Vietnamese flag is a political
// statement the church has not made. Endonyms are the W3C's recommendation
// for exactly this reason, so they are a constant here rather than a
// message key.
const NATIVE_NAME: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
}

// LanguageSwitcher renders the English / Tiếng Việt toggle in the navbar. It
// is a "true" client component because it owns interaction state and reads
// the current locale at render time to highlight the active option.
//
// Why a visible toggle rather than a hamburger-only switcher:
// per `feedback_legitimacy_over_thumbzone`, the pre-launch site prioritizes
// "be seen everywhere" over thumb-zone purity for identity-class elements.
// Language is identity for a Vietnamese-American congregation - a visitor
// must spot the switcher within ~3 seconds of landing, without opening any
// menu. So it sits on the chrome at every breakpoint.
//
// Why a hard navigation (window.location) instead of next-intl's soft
// router.replace: with `localePrefix: 'as-needed'` the default locale (en) is
// served at the UNPREFIXED path (`/`, `/events`). A client-side soft-nav back
// to it (`/vi` -> `/`) reuses the cached `[locale]` layout segment in a
// production build, so the NextIntlClientProvider keeps its old `vi` value -
// useLocale() goes stale, the toggle highlights the wrong language, and
// because `active` is then wrong every subsequent click no-ops and the
// switcher appears frozen. (Reproduces only in a prod build, not in dev where
// the layout re-renders eagerly.) A full document load re-runs the middleware
// and re-renders the layout from scratch, so the locale can never be stale.
// We trade the SPA-feel prefetch optimization - which `as-needed` makes
// unreliable for the default locale - for correctness.
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const active = useLocale() as Locale
  const t = useTranslations('Language')
  // Local pending flag: a hard nav unloads the page, so we just disable the
  // controls for the brief moment before the browser takes over (also guards
  // against a double-click firing two navigations).
  const [isSwitching, setIsSwitching] = useState(false)
  const { confirmDiscard } = useUnsavedChanges()

  // Async because the discard prompt is now an in-app dialog that resolves on
  // click rather than a blocking window.confirm. Everything after the await is
  // unchanged - the hard nav simply happens once the user has answered.
  async function switchTo(target: Locale) {
    if (target === active) return
    // Tier 2: if an editor on the page has unsaved, non-auto-restored edits
    // (e.g. the post modal), confirm before the switch discards the open state.
    if (!(await confirmDiscard('Switching language reloads the page. Unsaved changes in the open editor will be lost.'))) {
      return
    }
    // Tier 1: record scroll so the reloaded tree lands in the same place and
    // skips the entry fade. sessionStorage survives a same-tab full reload, so
    // PageTransition still consumes this signal after the hard nav - the switch
    // restores scroll position rather than jumping to the top.
    markLocaleSwitch(window.scrollY)
    setIsSwitching(true)
    // Build the target URL from the RAW browser path. `localePrefix: 'always'`
    // means EVERY locale is prefixed (/en/..., /vi/...), so we strip whatever
    // locale prefix is on the current path and add the target's. Using the raw
    // window.location.pathname (not next-intl's usePathname) keeps this immune
    // to the prefix-stripping quirks that bit us under the old 'as-needed' setup.
    const bare = stripLocalePrefix(window.location.pathname)
    const targetPath = `/${target}` + (bare === '/' ? '' : bare)
    window.location.assign(targetPath + window.location.search + window.location.hash)
  }

  return (
    <>
      {/* Pending feedback: a thin top bar reassures the user the switch is in
          flight during the brief beat before the browser starts the reload. */}
      {isSwitching && (
        <span className="fixed inset-x-0 top-0 z-[9999] block h-[2px] overflow-hidden bg-primary/20" aria-hidden>
          <span className="animate-nav-progress block h-full w-full origin-left bg-primary" />
        </span>
      )}
      <div
        role="group"
        aria-label={t('label')}
        // A soft pill track on the surface color, so the two options read as
        // one control and the active one as the filled half.
        className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/80 p-0.5 ${className}`}
      >
        {/* Globe: a neutral "language" glyph, decorative. Hidden on phones
            where the single inactive name already says what this is. */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-2 mr-0.5 hidden h-4 w-4 shrink-0 text-muted md:block"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        {routing.locales.map((code) => {
          const locale = code as Locale
          const isActive = locale === active
          const fullName = t(locale)
          // Mobile width budget: the bar holds the brand, this control and the
          // hamburger. Below md, hide the active pill so only the INACTIVE
          // language shows - it acts as a single "switch to X" button, in that
          // language. At md+ both pills render so users see current state at a
          // glance.
          const responsiveVisibility = isActive ? 'hidden md:inline-flex' : 'inline-flex'
          return (
            <button
              key={locale}
              type="button"
              onClick={() => switchTo(locale)}
              aria-pressed={isActive}
              aria-label={t('switchTo', { language: fullName })}
              lang={locale}
              disabled={isSwitching}
              className={`${responsiveVisibility} h-9 items-center justify-center whitespace-nowrap rounded-full px-3.5 font-sans text-sm font-bold transition-colors ${
                isActive
                  ? 'cursor-default bg-primary text-white'
                  : 'text-foreground hover:bg-primary/10 hover:text-primary'
              } ${isSwitching && !isActive ? 'opacity-60' : ''}`}
            >
              {NATIVE_NAME[locale]}
            </button>
          )
        })}
      </div>
    </>
  )
}
