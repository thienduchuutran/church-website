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
    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .single()
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
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
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
