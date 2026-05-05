'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { useAuth } from '@/lib/auth'

type NavLink = { kind: 'link'; href: string; label: string }
type NavDropdown = { kind: 'dropdown'; label: string; children: { href: string; label: string }[] }
type NavItem = NavLink | NavDropdown

const navItems: NavItem[] = [
  { kind: 'link', href: '/', label: 'Home' },
  {
    kind: 'dropdown',
    label: 'News',
    children: [
      { href: '/events', label: 'Events' },
      { href: '/announcements', label: 'Announcements' },
    ],
  },
  { kind: 'link', href: '/calendar', label: 'Calendar' },
  { kind: 'link', href: '/gallery', label: 'Gallery' },
  { kind: 'link', href: '/resources', label: 'Resources' },
  { kind: 'link', href: '/about', label: 'About' },
]

const connectHref = '/connect'
const MOBILE_NAV_ID = 'primary-mobile-nav'

/** Stable id for aria-controls wiring between trigger and submenu. */
function dropdownPanelId(label: string) {
  return `nav-dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`
}

function dropdownTriggerId(label: string) {
  return `nav-trigger-${label.toLowerCase().replace(/\s+/g, '-')}`
}

export default function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopDropdown, setDesktopDropdown] = useState<string | null>(null)
  const { session, isAdmin, loading, signIn, signOut } = useAuth()

  const dropdownContainerRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const setDropdownRef = useCallback((label: string, el: HTMLLIElement | null) => {
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
      const li = dropdownContainerRefs.current.get(desktopDropdown)
      const target = e.target as Node
      if (li && !li.contains(target)) setDesktopDropdown(null)
    }

    const onFocusIn = (e: FocusEvent) => {
      const li = dropdownContainerRefs.current.get(desktopDropdown)
      const target = e.target as Node
      if (li && !li.contains(target)) setDesktopDropdown(null)
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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <nav aria-label="Primary" className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg font-display text-lg font-bold tracking-tight text-primary"
          >
            VGOMNE
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              if (item.kind === 'link') {
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 font-display text-sm font-medium transition-colors ${pathname === item.href
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted hover:bg-primary/5 hover:text-primary'
                        }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              }

              const isActive = item.children.some((c) => pathname === c.href)
              const isOpen = desktopDropdown === item.label
              const panelId = dropdownPanelId(item.label)
              const triggerId = dropdownTriggerId(item.label)

              return (
                <li
                  key={item.label}
                  ref={(el) => setDropdownRef(item.label, el)}
                  className="relative"
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null
                    if (next && e.currentTarget.contains(next)) return
                    setDesktopDropdown(null)
                  }}
                >
                  <button
                    type="button"
                    id={triggerId}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 font-display text-sm font-medium transition-colors ${isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted hover:bg-primary/5 hover:text-primary'
                      }`}
                    onClick={() => {
                      setDesktopDropdown((cur) => (cur === item.label ? null : item.label))
                    }}
                  >
                    {item.label}
                    <svg
                      className="h-3 w-3 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <ul
                    id={panelId}
                    role="list"
                    className={`absolute left-0 top-full z-50 mt-0 min-w-[10rem] rounded-lg border border-border bg-surface p-1 shadow-md ${isOpen ? 'block' : 'hidden'
                      }`}
                  >
                    {item.children.map(({ href, label }) => (
                      <li key={href}>
                        <Link
                          href={href}
                          className={`block min-h-11 rounded-md px-3 py-2 font-display text-sm font-medium leading-snug transition-colors ${pathname === href
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted hover:bg-primary/5 hover:text-primary'
                            }`}
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center gap-2">
            <Link
              href={connectHref}
              className={`hidden min-h-11 items-center justify-center rounded-lg px-3 font-display text-sm font-semibold transition-colors md:inline-flex ${pathname === connectHref
                  ? 'bg-primary text-surface'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
            >
              Connect
            </Link>

            {!loading && (
              <div className="hidden items-center gap-2 md:flex">
                {session ? (
                  <>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 font-display text-sm font-medium transition-colors ${pathname.startsWith('/admin')
                            ? 'bg-accent/15 text-accent'
                            : 'text-muted hover:text-accent'
                          }`}
                      >
                        Admin
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex min-h-11 items-center rounded-lg px-3 py-1.5 font-display text-sm font-medium text-muted transition-colors hover:bg-primary/5 hover:text-foreground"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={signIn}
                    className="inline-flex min-h-11 items-center rounded-lg bg-primary/10 px-3 py-1.5 font-display text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    Sign in
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary/5 md:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-controls={MOBILE_NAV_ID}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <ul
          id={MOBILE_NAV_ID}
          hidden={!mobileOpen}
          className="space-y-1 border-t border-border px-4 pb-4 pt-2 md:hidden"
        >
          {navItems.map((item) => {
            if (item.kind === 'link') {
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block min-h-11 rounded-lg px-3 py-2 font-display text-sm font-medium leading-snug transition-colors ${pathname === item.href
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted hover:bg-primary/5 hover:text-primary'
                      }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            }

            const isActive = item.children.some((c) => pathname === c.href)
            return (
              <li key={item.label}>
                <span
                  className={`block px-3 py-2 font-display text-sm font-medium ${isActive ? 'text-primary' : 'text-muted'
                    }`}
                >
                  {item.label}
                </span>
                <ul className="ml-4 space-y-1" role="list">
                  {item.children.map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={`block min-h-11 rounded-lg px-3 py-2 font-display text-sm font-medium leading-snug transition-colors ${pathname === href
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted hover:bg-primary/5 hover:text-primary'
                          }`}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}

          <li>
            <Link
              href={connectHref}
              onClick={() => setMobileOpen(false)}
              className={`block min-h-11 rounded-lg px-3 py-2 font-display text-sm font-medium transition-colors ${pathname === connectHref
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-primary/5 hover:text-primary'
                }`}
            >
              Connect
            </Link>
          </li>

          {!loading && (
            <li className="border-t border-border pt-2">
              {session ? (
                <div className="space-y-1">
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="block min-h-11 rounded-lg px-3 py-2 font-display text-sm font-medium text-accent"
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      signOut()
                      setMobileOpen(false)
                    }}
                    className="block min-h-11 w-full rounded-lg px-3 py-2 text-left font-display text-sm font-medium text-muted hover:bg-primary/5"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    signIn()
                    setMobileOpen(false)
                  }}
                  className="block min-h-11 w-full rounded-lg px-3 py-2 text-left font-display text-sm font-medium text-primary"
                >
                  Sign in
                </button>
              )}
            </li>
          )}
        </ul>
      </nav>
    </header>
  )
}
