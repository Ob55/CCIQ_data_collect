import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { profileSchema } from '@/lib/schemas'

/**
 * Return the current user's identity (from the verified JWT) + validated profile,
 * or null if not signed in.
 *
 * Wrapped in React `cache()` so the layout, page and any actions in a single render
 * share ONE auth check + ONE profiles query instead of each paying for its own.
 * Uses `getClaims()` (local JWT verification via the project's signing keys) instead
 * of `getUser()` so there is no network round-trip per navigation. The role is still
 * read from the `profiles` table — never trusted from the JWT/user metadata.
 *
 * @returns {Promise<{ user: { id: string, email: string | undefined }, profile: import('@/lib/schemas').Profile } | null>}
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (claimsError || !claims?.sub) return null

  const user = { id: claims.sub, email: claims.email }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (error || !data) return null

  return { user, profile: profileSchema.parse(data) }
})

/**
 * Require a signed-in user; redirect to /login otherwise. Server-side auth gate (PRD §10).
 * @returns {Promise<{ user: { id: string, email: string | undefined }, profile: import('@/lib/schemas').Profile }>}
 */
export async function requireUser() {
  const current = await getCurrentUser()
  if (!current) redirect('/login')
  return current
}

/**
 * Require one of the given roles. Enforced on the server, never trusting a client role (PRD §10).
 * @param {import('@/lib/schemas').Role[]} roles
 */
export async function requireRole(roles) {
  const current = await requireUser()
  if (!roles.includes(current.profile.role)) redirect('/dashboard')
  return current
}
