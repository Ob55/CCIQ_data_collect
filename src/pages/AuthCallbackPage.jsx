import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/**
 * Magic-link / invite / recovery callback. The Supabase client is configured with
 * detectSessionInUrl, so it exchanges the code in the URL for a session automatically on load.
 * We just wait for that session, then forward to `next` (default /dashboard).
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const safeNext = next.startsWith('/') ? next : '/dashboard'

  useEffect(() => {
    let done = false
    const go = (path) => {
      if (!done) {
        done = true
        navigate(path, { replace: true })
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go(safeNext)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go(safeNext)
    })

    // If nothing arrives, the link was bad or expired.
    const timer = setTimeout(() => go('/login?error=auth'), 5000)

    return () => {
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [navigate, safeNext])

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand text-sm text-brand-foreground/80">
      Signing you in…
    </div>
  )
}
