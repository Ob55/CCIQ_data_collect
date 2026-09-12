// @ts-check
// User administration (PRD §3, §7 screen 6). Admin-only. Uses the service role for
// auth.admin operations; every caller must be gated with requireRole(['admin']) first.
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail, isMailerConfigured } from '@/lib/mailer'

const PERMA_BAN = '876000h' // ~100 years — used to lock out deactivated accounts

/** All users with role + status. Admin reads all profiles via RLS. */
export async function listUsers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active, created_at')
    .order('role')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Invite a user. Emails them the invite link over SMTP when configured; otherwise returns
 * the action-link so the admin can send it manually. The profile row + role are created by
 * the auth trigger from user metadata.
 * @param {{ actorId: string, email: string, full_name: string, role: string, redirectTo: string }} input
 * @returns {Promise<{ actionLink: string | null, emailed: boolean }>}
 */
export async function inviteUser({ actorId, email, full_name, role, redirectTo }) {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { full_name, role }, redirectTo },
  })
  if (error) throw new Error(error.message)

  // Ensure the profile reflects the intended role immediately (trigger also sets it).
  const userId = data.user?.id
  if (userId) {
    await admin
      .from('profiles')
      .upsert({ id: userId, email, full_name, role, active: true }, { onConflict: 'id' })
  }

  const actionLink = data.properties?.action_link ?? null

  // Send the invite by email when SMTP is configured. If delivery fails we fall back to
  // returning the link (the invite itself is already valid), so the admin is never stuck.
  let emailed = false
  if (actionLink && isMailerConfigured()) {
    try {
      await sendMail(inviteEmail({ to: email, full_name, role, actionLink }))
      emailed = true
    } catch (err) {
      console.error('Invite email failed, falling back to link:', err.message)
    }
  }

  await writeAudit(actorId, 'user', userId, 'user.invite', { email, role, emailed })
  // When emailed, hide the link so the UI shows "email sent"; otherwise expose it to copy.
  return { actionLink: emailed ? null : actionLink, emailed }
}

/** Build the invite email (plain text + minimal HTML). */
function inviteEmail({ to, full_name, role, actionLink }) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  return {
    to,
    subject: 'Your invitation to CleanCook Data Collection',
    text:
      `Hi ${full_name},\n\n` +
      `You've been invited to CleanCook Data Collection as a ${roleLabel}.\n` +
      `Click the link below to set your password and sign in:\n\n${actionLink}\n\n` +
      `If you weren't expecting this invitation, you can ignore this email.`,
    html:
      `<p>Hi ${full_name},</p>` +
      `<p>You've been invited to <strong>CleanCook Data Collection</strong> as a <strong>${roleLabel}</strong>.</p>` +
      `<p><a href="${actionLink}">Set your password and sign in</a></p>` +
      `<p style="color:#666;font-size:12px">If you weren't expecting this invitation, you can ignore this email.</p>`,
  }
}

/** Change a user's role (admin only). */
export async function setUserRole({ actorId, userId, role }) {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId)
  if (error) throw new Error(error.message)
  await writeAudit(actorId, 'user', userId, 'user.role', { role })
}

/** Deactivate / reactivate a user. Soft (profiles.active) plus an auth ban so they can't sign in. */
export async function setUserActive({ actorId, userId, active }) {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ active }).eq('id', userId)
  if (error) throw new Error(error.message)
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : PERMA_BAN })
  await writeAudit(actorId, 'user', userId, active ? 'user.activate' : 'user.deactivate')
}

async function writeAudit(actorId, entityType, entityId, action, meta = {}) {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    action,
    meta,
  })
}
