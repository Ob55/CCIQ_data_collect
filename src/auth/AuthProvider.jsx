import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { profileSchema } from '@/lib/schemas'

/**
 * Client-side auth context. Replaces the Next.js middleware + server `getCurrentUser()`:
 * holds the Supabase session and the user's validated profile (role read from the
 * `profiles` table, never trusted from the JWT). Re-runs on every auth state change.
 */
const AuthContext = createContext(null)

async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error || !data) return null
  try {
    return profileSchema.parse(data)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (activeSession) => {
    const s = activeSession ?? (await supabase.auth.getSession()).data.session
    setSession(s)
    setProfile(s?.user ? await loadProfile(s.user.id) : null)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await refresh()
      if (mounted) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Keep context in sync with sign-in / sign-out / token refresh.
      refresh(s)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [refresh])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    async signOut() {
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
