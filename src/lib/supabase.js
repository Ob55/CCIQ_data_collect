import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Single browser Supabase client for the whole SPA. Uses the anon key — safe in the
// browser because Row Level Security governs every table. The session is persisted in
// localStorage and auto-refreshed by supabase-js (no server middleware needed).
//
// Service-role operations (user invites) live in a Supabase Edge Function, never here.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loudly in dev if env is missing, rather than a cryptic 401 later.
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars.')
}

export const supabase = createSupabaseClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Store the session in sessionStorage, not localStorage: it survives a page refresh
    // within the same tab, but closing the tab/window ends the session so the user must
    // sign in again next time. (Falls back gracefully if sessionStorage is unavailable.)
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
})

/** Kept for source compatibility with the reused lib/* modules. */
export function createClient() {
  return supabase
}
