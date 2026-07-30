'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  isAdmin: boolean
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  isAdmin: false,
  loading: true,
  signIn: async () => { },
  signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)

// Module-scoped snapshot of the last resolved auth state. It survives client-
// side remounts - including the full [locale] subtree remount on a language
// switch - so the provider can seed itself instead of flashing back to
// `loading` and re-hitting /auth/me on every switch (which is what made a
// language switch feel like a full page reload, especially on admin pages).
//
// Safe against SSR cross-request leakage because it is ONLY ever written from a
// client-side effect/callback below; on the server it stays null, so every SSR
// render starts from the same loading state.
let authSnapshot: { session: Session | null; isAdmin: boolean } | null = null

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(authSnapshot?.session ?? null)
  const [isAdmin, setIsAdmin] = useState(authSnapshot?.isAdmin ?? false)
  // If we already have a snapshot we're not "loading" - the effect still
  // re-validates in the background, but the UI never flashes.
  const [loading, setLoading] = useState(authSnapshot === null)

  // Calls the backend instead of querying Supabase directly - required now
  // that the admins table lives on RDS, not in Supabase Postgres.
  async function checkAdmin(accessToken: string) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      setIsAdmin(res.ok)
    } catch {
      setIsAdmin(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.access_token) {
        checkAdmin(session.access_token)
      } else {
        setLoading(false)
      }
    }).catch(() => {
      // getSession can reject when Supabase is unreachable or a stored token
      // fails to refresh. Without this, `loading` would stay true forever and
      // any consumer that waits on it (CalendarShell holds its fetch back until
      // auth resolves) would hang. Failing closed = treated as signed out.
      setSession(null)
      setIsAdmin(false)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.access_token) {
        checkAdmin(session.access_token)
      } else {
        setIsAdmin(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Keep the module snapshot current once auth has resolved, so the next
  // remount (e.g. a language switch) seeds instantly from it. Client-only:
  // effects never run during SSR, so the server snapshot stays null.
  useEffect(() => {
    if (!loading) authSnapshot = { session, isAdmin }
  }, [session, isAdmin, loading])

  const value = useMemo(
    () => ({
      session,
      isAdmin,
      loading,
      signIn: async () => {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account' },
          },
        })
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setIsAdmin(false)
      },
    }),
    [session, isAdmin, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
