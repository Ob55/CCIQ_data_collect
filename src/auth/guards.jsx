import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

function FullScreenSpinner() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

/**
 * Gate for any signed-in user. Replaces the Next.js middleware auth redirect:
 * unauthenticated users go to /login with a `next` param so they return after signing in.
 */
export function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}

/**
 * Gate for specific roles (replaces server `requireRole`). Signed-in users lacking the
 * role are bounced to the dashboard, matching the old behavior.
 */
export function RequireRole({ roles, children }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!roles.includes(role)) return <Navigate to="/dashboard" replace />
  return children
}
