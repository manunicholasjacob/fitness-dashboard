import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './supabase'
import { clearCache } from './cache'
import { isDemoMode } from './api'

/**
 * Demo mode has no real identity. This stands in for a Supabase session so the
 * routing and data layers can stay completely unaware of which mode they are
 * running in.
 */
const DEMO_SESSION = { user: { id: 'demo-user' } } as unknown as Session

interface AuthState {
  session: Session | null
  loading: boolean
  configured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(isDemoMode ? DEMO_SESSION : null)
  const [loading, setLoading] = useState(!isDemoMode)

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setLoading(false)
      return
    }

    // Resolve the stored session first so a returning device never flashes the
    // login screen, then keep listening for refreshes and sign-outs.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      configured: isConfigured || isDemoMode,
      async signOut() {
        if (isDemoMode) {
          setSession(null)
          return
        }
        // Drop cached rows on the way out; the next user of this device should
        // not see the previous session's numbers painted from localStorage.
        clearCache()
        await supabase?.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
