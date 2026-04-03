'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/resources', label: 'Resources' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { session, isAdmin, loading, signIn, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-primary"
        >
          Our Church
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-primary/5 hover:text-primary'
                  }`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          {!loading && (
            <div className="hidden items-center gap-2 md:flex">
              {session ? (
                <>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname.startsWith('/admin')
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
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-primary/5 hover:text-foreground"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={signIn}
                  className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Sign in
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="rounded-lg p-2 text-muted hover:bg-primary/5 md:hidden"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <ul className="space-y-1 border-t border-border px-4 pb-4 pt-2 md:hidden">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-primary/5 hover:text-primary'
                  }`}
              >
                {label}
              </Link>
            </li>
          ))}

          {!loading && (
            <li className="border-t border-border pt-2">
              {session ? (
                <div className="space-y-1">
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-accent"
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      signOut()
                      setOpen(false)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-primary/5"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    signIn()
                    setOpen(false)
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-primary"
                >
                  Sign in
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </header>
  )
}
