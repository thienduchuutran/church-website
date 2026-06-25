'use client'

import { useEffect, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname, routing, type Locale } from '@/i18n/routing'
import { markLocaleSwitch } from '@/lib/locale-transition'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

// LanguageSwitcher renders the EN / VI toggle in the navbar. It is a "true"
// client component because it owns interaction state (useTransition) and reads
// the current locale at render time to highlight the active option.
//
// Why a visible toggle rather than a hamburger-only switcher:
// per `feedback_legitimacy_over_thumbzone`, the pre-launch site prioritizes
// "be seen everywhere" over thumb-zone purity for identity-class elements.
// Language is identity for a Vietnamese-American congregation - a visitor
// must spot the switcher within ~3 seconds of landing, without opening any
// menu. So both options are shown on the chrome at every breakpoint, even
// at the cost of mobile horizontal real estate.
//
// next-intl's router strips/adds the locale prefix automatically, so:
//   - on /vi/events, usePathname() returns '/events'
//   - router.replace('/events', { locale: 'en' }) navigates to '/events'
//   - router.replace('/events', { locale: 'vi' }) navigates to '/vi/events'
// The middleware sets the NEXT_LOCALE cookie on the response, so the
// preference sticks across visits.
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const active = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('Language')
  const [isPending, startTransition] = useTransition()
  const { confirmDiscard } = useUnsavedChanges()

  // Warm the client Router Cache with the other locale(s) of the current page,
  // so a switch reads the already-rendered page from memory instead of waiting
  // on a backend round-trip. Re-runs when the page (pathname) changes. This is
  // the "cache the other language" piece - prefetch is idempotent, so doing it
  // on every relevant render is cheap.
  useEffect(() => {
    for (const code of routing.locales) {
      if (code !== active) router.prefetch(pathname, { locale: code as Locale })
    }
  }, [pathname, active, router])

  function switchTo(target: Locale) {
    if (target === active) return
    // Tier 2: if an editor on the page has unsaved, non-auto-restored edits
    // (e.g. the post modal), confirm before the switch discards the open state.
    if (!confirmDiscard('Switch language now? Unsaved changes in the open editor will be lost.')) {
      return
    }
    // Tier 1: record scroll so the remounted tree lands in the same place and
    // skips the entry fade - the switch should feel in-place, not like a reload.
    markLocaleSwitch(window.scrollY)
    startTransition(() => {
      router.replace(pathname, { locale: target })
    })
  }

  return (
    <>
      {/* Pending feedback: useTransition keeps the old page interactive while
          the new-locale tree loads, so a thin top bar reassures the user the
          switch is in flight (the button row also dims via opacity below). */}
      {isPending && (
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
            disabled={isPending}
            className={`${responsiveVisibility} h-11 min-w-11 items-center justify-center px-2.5 font-display text-xs font-semibold uppercase tracking-wider transition-colors ${
              isActive
                ? 'cursor-default bg-primary/10 text-primary'
                : 'text-muted hover:bg-primary/5 hover:text-primary'
            } ${isPending && !isActive ? 'opacity-60' : ''}`}
          >
            {code}
          </button>
        )
      })}
      </div>
    </>
  )
}
