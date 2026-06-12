'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname, routing, type Locale } from '@/i18n/routing'

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

  function switchTo(target: Locale) {
    if (target === active) return
    startTransition(() => {
      router.replace(pathname, { locale: target })
    })
  }

  return (
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
  )
}
