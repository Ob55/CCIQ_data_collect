import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components. Uses the anon key, which is
 * safe in the browser because Row Level Security governs every table.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
