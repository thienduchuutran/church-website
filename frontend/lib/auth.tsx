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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function checkAdmin(email: string) {
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .single()
    // #region agent log
    fetch('http://127.0.0.1:7417/ingest/723dd05e-74b5-434b-b846-6c25c0f838bc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c2745d' },
      body: JSON.stringify({
        sessionId: 'c2745d',
        location: 'auth.tsx:checkAdmin',
        message: 'admins lookup',
        hypothesisId: 'H1-RLS',
        data: { hasRow: !!data, errCode: error?.code ?? null },
        timestamp: Date.now(),
      }),
    }).catch(() => { })
    // #endregion
    setIsAdmin(!!data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user?.email) {
        checkAdmin(session.user.email)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user?.email) {
        checkAdmin(session.user.email)
      } else {
        setIsAdmin(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo(
    () => ({
      session,
      isAdmin,
      loading,
      signIn: async () => {
        await supabase.auth.signInWithOAuth({ provider: 'google' })
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
