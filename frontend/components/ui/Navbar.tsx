'use client'

import Image from 'next/image'
import { Link, usePathname } from '@/i18n/routing'
import { useTranslations } from 'next-intl'
import { useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { useAuth } from '@/lib/auth'
import SocialIconBar from '@/components/ui/SocialIconBar'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

// Labels are message keys in the `Nav` namespace so the chrome is entirely in
// the active language - a /vi visitor never sees an English word in the bar.
type NavLink = { kind: 'link'; href: string; label: string }
type NavDropdown = { kind: 'dropdown'; label: string; children: { href: string; label: string }[] }
type NavItem = NavLink | NavDropdown

// Desktop bar: the brand mark IS the home link, so "Home" only appears in the
// mobile panel (where there is no wordmark next to a page title to imply it).
const desktopItems: NavItem[] = [
  {
    kind: 'dropdown',
    label: 'news',
    children: [
      { href: '/events', label: 'events' },
      { href: '/announcements', label: 'announcements' },
    ],
  },
  { kind: 'link', href: '/calendar', label: 'calendar' },
  { kind: 'link', href: '/gallery', label: 'gallery' },
  { kind: 'link', href: '/resources', label: 'resources' },
  { kind: 'link', href: '/about', label: 'about' },
]
const mobileItems: NavItem[] = [{ kind: 'link', href: '/', label: 'home' }, ...desktopItems]

const connectHref = '/connect'
const MOBILE_NAV_ID = 'primary-mobile-nav'
const ACCOUNT_MENU = 'account'

// Nav links sit on the lavender panel: ink at rest (13.9:1), a magenta wash on
// hover, and a solid magenta pill when active. Pills are fully rounded and
// carry real padding so neighbouring states never touch.
const PILL = 'inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3.5 py-2 font-sans text-[0.9375rem] font-bold transition-colors'
const PILL_IDLE = 'text-foreground hover:bg-primary/10 hover:text-primary'
const PILL_ACTIVE = 'bg-primary text-white'
const MENU = 'absolute top-full z-50 mt-1 min-w-[11rem] rounded-xl border border-border bg-surface p-1.5 shadow-card'

function Chevron() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function dropdownPanelId(label: string) {
  return `nav-dropdown-${label}`
}

function dropdownTriggerId(label: string) {
  return `nav-trigger-${label}`
}

export default function Navbar() {
  const pathname = usePathname()
  const t = useTranslations('Nav')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopDropdown, setDesktopDropdown] = useState<string | null>(null)
  const { session, isAdmin, loading, hint, signIn, signOut } = useAuth()

  // What the account slot shows. While auth is still resolving after a full
  // reload, the sessionStorage hint stands in, so the slot draws the right
  // control on the first paint instead of appearing a moment later. The hint
  // is display-only; nothing here grants access.
  const known = !loading || hint !== null
  const showSignedIn = loading ? Boolean(hint?.signedIn) : session !== null
  const showAdmin = loading ? Boolean(hint?.isAdmin) : isAdmin
  const onAdminRoute = pathname.startsWith('/admin')

  const dropdownContainerRefs = useRef<Map<string, HTMLElement>>(new Map())

  const setDropdownRef = useCallback((label: string, el: HTMLElement | null) => {
    const map = dropdownContainerRefs.current
    if (el) map.set(label, el)
    else map.delete(label)
  }, [])

  useEffect(() => {
    startTransition(() => {
      setDesktopDropdown(null)
      setMobileOpen(false)
    })
  }, [pathname])

  useEffect(() => {
    if (!desktopDropdown) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDesktopDropdown(null)
    }

    const onPointerDown = (e: MouseEvent) => {
      const el = dropdownContainerRefs.current.get(desktopDropdown)
      const target = e.target as Node
      if (el && !el.contains(target)) setDesktopDropdown(null)
    }

    const onFocusIn = (e: FocusEvent) => {
      const el = dropdownContainerRefs.current.get(desktopDropdown)
      const target = e.target as Node
      if (el && !el.contains(target)) setDesktopDropdown(null)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [desktopDropdown])

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  // Shared hover/blur behaviour for the two desktop disclosures (News and
  // Account). Mouse-leave does not close while keyboard focus is inside, so
  // a user tabbing through the menu is not cut off when the pointer drifts.
  const disclosureHandlers = (key: string) => ({
    ref: (el: HTMLElement | null) => setDropdownRef(key, el),
    onMouseEnter: () => setDesktopDropdown(key),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (e.currentTarget.contains(document.activeElement)) return
      setDesktopDropdown(null)
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null
      if (next && e.currentTarget.contains(next)) return
      setDesktopDropdown(null)
    },
  })

  return (
    <>
      {/* Scrim - sits behind the floating panel, closes menu on tap */}
      <div
        aria-hidden
        className={`fixed inset-0 z-40 bg-hero-bg/40 transition-opacity duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* The bar is the lavender panel, opaque (no glass), so the brand field
          is the first thing on every page. Three zones: brand, centered links,
          right cluster. The desktop layout starts at lg, because below that
          the full set of controls does not fit without crowding. Nothing in
          the bar changes width after first paint: the account slot is a
          fixed-width box whatever auth turns out to be. */}
      <header className="relative sticky top-0 z-50 border-b border-border bg-panel/95">
        <nav aria-label={t('primary')} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-4 lg:gap-8">
            <Link
              href="/"
              className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg font-heading text-[1.15rem] font-bold tracking-[0.04em] text-primary"
            >
              {/* The emblem: cross, laver, pitcher and crown in the logo
                  gradient. Decorative here - the wordmark is the accessible
                  name - so alt is empty. */}
              <Image
                src="/logo.jpg"
                alt=""
                width={36}
                height={36}
                priority
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
              VGOMNE
            </Link>

            <ul className="hidden flex-1 items-center justify-center gap-1 lg:flex">
              {desktopItems.map((item) => {
                if (item.kind === 'link') {
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`${PILL} ${pathname === item.href ? PILL_ACTIVE : PILL_IDLE}`}
                      >
                        {t(item.label)}
                      </Link>
                    </li>
                  )
                }

                const isActive = item.children.some((c) => pathname === c.href)
                const isOpen = desktopDropdown === item.label
                const panelId = dropdownPanelId(item.label)
                const triggerId = dropdownTriggerId(item.label)

                return (
                  <li key={item.label} className="relative" {...disclosureHandlers(item.label)}>
                    <button
                      type="button"
                      id={triggerId}
                      aria-haspopup="true"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className={`${PILL} gap-1 ${isActive ? PILL_ACTIVE : PILL_IDLE}`}
                      onClick={() => {
                        setDesktopDropdown((cur) => (cur === item.label ? null : item.label))
                      }}
                    >
                      {t(item.label)}
                      <Chevron />
                    </button>
                    <ul id={panelId} role="list" className={`${MENU} left-0 ${isOpen ? 'block' : 'hidden'}`}>
                      {item.children.map(({ href, label }) => (
                        <li key={href}>
                          <Link
                            href={href}
                            className={`${PILL} w-full rounded-lg ${pathname === href ? PILL_ACTIVE : PILL_IDLE}`}
                          >
                            {t(label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>

            <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:gap-3">
              {/* Language switcher stays on the chrome at every breakpoint: a
                  Vietnamese-speaking visitor must find it without opening any
                  menu. On phones it collapses to the single inactive option. */}
              <LanguageSwitcher />

              {/* Social icons only where there is room for them (xl+). Below
                  that they live at the foot of the mobile panel and in the
                  site footer, so they are never more than one tap away. */}
              <div className="hidden items-center border-l border-border pl-3 xl:flex">
                <SocialIconBar variant="header" />
              </div>

              {/* Connect is the site's one call to action, so it is always the
                  solid magenta button; on its own route it just sits darker. */}
              <Link
                href={connectHref}
                className={`hidden min-h-10 items-center justify-center whitespace-nowrap rounded-full px-4 font-sans text-[0.9375rem] font-semibold text-white transition-colors lg:inline-flex ${
                  pathname === connectHref ? 'bg-primary-light' : 'bg-primary hover:bg-primary-light'
                }`}
              >
                {t('connect')}
              </Link>

              {/* Account slot: a fixed-width box so the bar never reflows.
                  Signed out -> "Sign in". Signed in -> one "Account" disclosure
                  holding Admin (when allowed) and Sign out. Unknown -> an
                  invisible placeholder of the same size. */}
              <div className="hidden w-[7.5rem] justify-end lg:flex">
                {showSignedIn ? (
                  <div className="relative" {...disclosureHandlers(ACCOUNT_MENU)}>
                    <button
                      type="button"
                      id={dropdownTriggerId(ACCOUNT_MENU)}
                      aria-haspopup="true"
                      aria-expanded={desktopDropdown === ACCOUNT_MENU}
                      aria-controls={dropdownPanelId(ACCOUNT_MENU)}
                      className={`${PILL} gap-1 ${onAdminRoute ? 'bg-accent text-white' : PILL_IDLE}`}
                      onClick={() => {
                        setDesktopDropdown((cur) => (cur === ACCOUNT_MENU ? null : ACCOUNT_MENU))
                      }}
                    >
                      {t('account')}
                      <Chevron />
                    </button>
                    <ul
                      id={dropdownPanelId(ACCOUNT_MENU)}
                      role="list"
                      className={`${MENU} right-0 ${desktopDropdown === ACCOUNT_MENU ? 'block' : 'hidden'}`}
                    >
                      {showAdmin && (
                        <li>
                          <Link
                            href="/admin"
                            className={`${PILL} w-full rounded-lg ${
                              onAdminRoute ? 'bg-accent text-white' : 'text-foreground hover:bg-accent/15 hover:text-accent'
                            }`}
                          >
                            {t('adminDashboard')}
                          </Link>
                        </li>
                      )}
                      <li>
                        <button type="button" onClick={signOut} className={`${PILL} w-full rounded-lg ${PILL_IDLE}`}>
                          {t('signOut')}
                        </button>
                      </li>
                    </ul>
                  </div>
                ) : known ? (
                  <button type="button" onClick={signIn} className={`${PILL} text-primary hover:bg-primary/10`}>
                    {t('signIn')}
                  </button>
                ) : (
                  <span aria-hidden className={`${PILL} invisible`}>
                    {t('signIn')}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-primary/10 lg:hidden"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-expanded={mobileOpen}
                aria-controls={MOBILE_NAV_ID}
                aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
              >
                <span className="relative block h-5 w-5" aria-hidden>
                  <svg
                    className={`absolute inset-0 h-5 w-5 transition-opacity duration-200 ${mobileOpen ? 'opacity-0' : 'opacity-100'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <svg
                    className={`absolute inset-0 h-5 w-5 transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          {/* Floating mobile nav panel - absolutely positioned, overlays page content */}
          <div
            id={MOBILE_NAV_ID}
            aria-hidden={!mobileOpen}
            className={`absolute left-0 right-0 top-full z-50 border-b border-border bg-panel shadow-card-hover transition-all duration-200 ease-out lg:hidden ${
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : '-translate-y-2 opacity-0 pointer-events-none'
            }`}
          >
            <ul className="mx-auto max-w-7xl space-y-1 px-4 pb-4 pt-3 sm:px-6">
              {mobileItems.map((item) => {
                if (item.kind === 'link') {
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`${PILL} w-full rounded-xl ${pathname === item.href ? PILL_ACTIVE : PILL_IDLE}`}
                      >
                        {t(item.label)}
                      </Link>
                    </li>
                  )
                }

                const isActive = item.children.some((c) => pathname === c.href)
                return (
                  <li key={item.label} className="pt-1">
                    <span className={`t-meta block px-3.5 py-2 ${isActive ? 'text-primary' : ''}`}>
                      {t(item.label)}
                    </span>
                    <ul className="space-y-1" role="list">
                      {item.children.map(({ href, label }) => (
                        <li key={href}>
                          <Link
                            href={href}
                            onClick={() => setMobileOpen(false)}
                            className={`${PILL} w-full rounded-xl ${pathname === href ? PILL_ACTIVE : PILL_IDLE}`}
                          >
                            {t(label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}

              <li className="pt-2">
                <Link
                  href={connectHref}
                  onClick={() => setMobileOpen(false)}
                  className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 font-sans text-[0.9375rem] font-semibold text-white transition-colors ${
                    pathname === connectHref ? 'bg-primary-light' : 'bg-primary hover:bg-primary-light'
                  }`}
                >
                  {t('connect')}
                </Link>
              </li>

              {known && (
                <li className="border-t border-border pt-2">
                  {showSignedIn ? (
                    <div className="space-y-1">
                      {showAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setMobileOpen(false)}
                          className={`${PILL} w-full rounded-xl text-accent hover:bg-accent/15`}
                        >
                          {t('adminDashboard')}
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          signOut()
                          setMobileOpen(false)
                        }}
                        className={`${PILL} w-full rounded-xl text-left ${PILL_IDLE}`}
                      >
                        {t('signOut')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        signIn()
                        setMobileOpen(false)
                      }}
                      className={`${PILL} w-full rounded-xl text-left text-primary hover:bg-primary/10`}
                    >
                      {t('signIn')}
                    </button>
                  )}
                </li>
              )}

              <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="t-meta px-3.5">{t('follow')}</span>
                <SocialIconBar variant="header" />
              </li>
            </ul>
          </div>
        </nav>
      </header>
    </>
  )
}
