import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { profileSchema } from '@/lib/schemas'

/**
 * Client-side auth context. Replaces the Next.js middleware + server `getCurrentUser()`:
 * holds the Supabase session and the user's validated profile (role read from the
 * `profiles` table, never trusted from the JWT).
 *
 * IMPORTANT: never `await` a Supabase database call *inside* the onAuthStateChange
 * callback — the auth client holds a lock there and it deadlocks. We only store the
 * session in the callback and load the profile from a separate effect keyed on the user id.
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
  const [loadingSession, setLoadingSession] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // 1) Track the session. Only synchronous state updates in the auth callback.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 2) Load the profile whenever the signed-in user changes (outside the auth lock).
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoadingProfile(false)
      return
    }
    let cancelled = false
    setLoadingProfile(true)
    loadProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Guards wait until the session is known AND (if signed in) the profile has resolved,
  // so pages never render with a null role.
  const loading = loadingSession || (!!session && loadingProfile)

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
