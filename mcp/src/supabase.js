// @ts-check
// Service-role Supabase client for the MCP server (PRD §4.2, Phase 8).
//
// READ-ONLY BY DISCIPLINE: this key bypasses all Row Level Security, so every caller in
// this package must use ONLY .select() (and storage .createSignedUrl). Never .insert(),
// .update(), .delete(), or a write RPC. The client is mirrored on src/lib/supabase/admin.js.
import { createClient } from '@supabase/supabase-js'

/**
 * Create the read-only service-role client. Fails loud if env is missing.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Set them in mcp/.env or in the MCP client config.'
    )
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
