'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const emailSchema = z.string().trim().email()

/**
 * Send a password-reset link — but only if the email belongs to a real user (checked against our
 * DB). Returns the SAME generic message whether or not the email exists, so this never reveals
 * which addresses are registered (§10).
 * @param {unknown} _prev
 * @param {FormData} formData
 */
export async function requestPasswordReset(_prev, formData) {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { ok: false, error: 'Enter a valid email address.' }
  const email = parsed.data.toLowerCase()
  const generic = { ok: true, message: 'If that email is registered, a reset link is on its way. Check your inbox.' }

  // Only send when the address maps to a known user.
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (!profile) return generic

  const hdrs = await headers()
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${hdrs.get('x-forwarded-proto') || 'http'}://${hdrs.get('host')}`

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })
  return generic
}
