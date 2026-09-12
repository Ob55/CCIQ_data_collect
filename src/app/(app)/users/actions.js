'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { inviteUserSchema, roleSchema } from '@/lib/schemas'
import { inviteUser, setUserRole, setUserActive } from '@/lib/users'

async function origin() {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') || 'http'
  return `${proto}://${h.get('host')}`
}

export async function inviteUserAction(_prev, formData) {
  const { user } = await requireRole(['admin'])
  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  try {
    const { actionLink } = await inviteUser({
      actorId: user.id,
      ...parsed.data,
      redirectTo: `${await origin()}/auth/callback`,
    })
    revalidatePath('/users')
    return { ok: true, actionLink }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function setRoleAction(formData) {
  const { user } = await requireRole(['admin'])
  const userId = formData.get('user_id')
  const role = roleSchema.parse(formData.get('role'))
  await setUserRole({ actorId: user.id, userId, role })
  revalidatePath('/users')
}

export async function setActiveAction(formData) {
  const { user } = await requireRole(['admin'])
  const userId = formData.get('user_id')
  const active = formData.get('active') === 'true'
  // Don't let an admin lock themselves out.
  if (userId === user.id && !active) return
  await setUserActive({ actorId: user.id, userId, active })
  revalidatePath('/users')
}
