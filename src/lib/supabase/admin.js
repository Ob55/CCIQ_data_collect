import { createClient } from '@supabase/supabase-js'

// Guard: the service-role key bypasses all RLS. It must never reach a browser bundle.
if (typeof window !== 'undefined') {
  throw new Error('supabase/admin.js was imported in the browser. This is a security bug.')
}

/**
 * Service-role Supabase client. Bypasses Row Level Security — use ONLY in trusted
 * server code that genuinely needs it (seed script, exports, audit-log writes).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
