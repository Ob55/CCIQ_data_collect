'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/schemas'

/**
 * Server Action: sign in with email + password. Validates input with Zod (PRD §4.1).
 * @param {unknown} _prevState
 * @param {FormData} formData
 * @returns {Promise<{ error?: string }>}
 */
export async function login(_prevState, formData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    return { error: 'Incorrect email or password.' }
  }

  const next = formData.get('next')
  redirect(typeof next === 'string' && next.startsWith('/') ? next : '/dashboard')
}
