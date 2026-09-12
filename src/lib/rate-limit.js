// @ts-check
// Shared rate limiter backed by Postgres (PRD §10) via the rate_limit_hit() function.
// Works across all serverless instances. Fails OPEN on limiter errors so a limiter outage
// never blocks legitimate submissions.
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * @param {string} key            identity to limit on (e.g. `submit:<userId>`)
 * @param {number} limit          max events per window
 * @param {number} windowSeconds  window length in seconds
 * @returns {Promise<{ ok: boolean, retryAfter: number }>}
 */
export async function rateLimit(key, limit = 30, windowSeconds = 60) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) return { ok: true, retryAfter: 0 } // fail open
    return { ok: data === true, retryAfter: data === true ? 0 : windowSeconds }
  } catch {
    return { ok: true, retryAfter: 0 }
  }
}
