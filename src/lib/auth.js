import { supabase } from '@/lib/supabase'
import { profileSchema } from '@/lib/schemas'

/**
 * Current user identity + validated profile, or null if not signed in. Browser version:
 * reads the Supabase session and the profiles row (role is always read from the table,
 * never trusted from the JWT). UI code should prefer the AuthProvider context; this helper
 * exists for the reused lib/* data functions.
 *
 * @returns {Promise<{ user: { id: string, email: string | undefined }, profile: import('@/lib/schemas').Profile } | null>}
 */
export async function getCurrentUser() {
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session?.user) return null

  const user = { id: session.user.id, email: session.user.email }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (error || !data) return null

  try {
    return { user, profile: profileSchema.parse(data) }
  } catch {
    return null
  }
}
