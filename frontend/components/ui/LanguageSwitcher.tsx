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

// LanguageSwitcher renders the EN / VI toggle in the navbar. It is a "true"
// client component because it owns interaction state and reads the current
// locale at render time to highlight the active option.
//
// Why a visible toggle rather than a hamburger-only switcher:
// per `feedback_legitimacy_over_thumbzone`, the pre-launch site prioritizes
// "be seen everywhere" over thumb-zone purity for identity-class elements.
// Language is identity for a Vietnamese-American congregation - a visitor
// must spot the switcher within ~3 seconds of landing, without opening any
// menu. So both options are shown on the chrome at every breakpoint, even
// at the cost of mobile horizontal real estate.
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
        // border + flex layout matches the existing pattern next to SocialIconBar.
        // overflow-hidden so the active background tint stays clipped to the pill.
        className={`inline-flex items-center overflow-hidden rounded-lg border border-border ${className}`}
      >
        {routing.locales.map((code) => {
        const isActive = code === active
        const fullName = t(code)
        // Mobile width budget: navbar logo + social icons + hamburger already
        // eat ~240px of a 343px iPhone-SE content area. Showing both pills
        // (~90px) overflows. Below md, hide the active pill so only the
        // INACTIVE locale shows - it acts as a single "switch to X" button.
        // At md+ both pills render so users see current state at a glance.
        const responsiveVisibility = isActive ? 'hidden md:inline-flex' : 'inline-flex'
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code as Locale)}
            aria-pressed={isActive}
            aria-label={t('switchTo', { language: fullName })}
            title={fullName}
            disabled={isSwitching}
            className={`${responsiveVisibility} h-11 min-w-11 items-center justify-center px-2.5 font-display text-xs font-semibold uppercase tracking-wider transition-colors ${
              isActive
                ? 'cursor-default bg-primary/10 text-primary'
                : 'text-muted hover:bg-primary/5 hover:text-primary'
            } ${isSwitching && !isActive ? 'opacity-60' : ''}`}
          >
            {code}
          </button>
        )
      })}
      </div>
    </>
  )
}
