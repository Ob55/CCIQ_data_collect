// User administration (PRD §3, §7 screen 6). Admin-only (RLS + route guard).
// Reads go through the anon client (RLS lets admins read all profiles). Operations that need
// the service role — inviting a user (auth admin + SMTP) and deactivating one (auth ban) —
// are delegated to the `admin-users` Supabase Edge Function. Role changes are a plain
// profiles UPDATE, which RLS already permits for admins.
import { supabase } from '@/lib/supabase'

/** All users with role + status. Admin reads all profiles via RLS. */
export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active, created_at')
    .order('role')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Invite a user via the admin-users Edge Function (service role + SMTP live there).
 * @param {{ email: string, full_name: string, role: string, redirectTo: string }} input
 * @returns {Promise<{ actionLink: string | null, emailed: boolean }>}
 */
export async function inviteUser({ email, full_name, role, redirectTo }) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'invite', email, full_name, role, redirectTo },
  })
  if (error) throw new Error(error.message)
  return { actionLink: data?.actionLink ?? null, emailed: Boolean(data?.emailed) }
}

/** Change a user's role (admin only). RLS permits the update; log it via the audit RPC. */
export async function setUserRole({ userId, role }) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw new Error(error.message)
  await supabase.rpc('log_audit', {
    p_entity_type: 'user',
    p_entity_id: userId,
    p_action: 'user.role',
    p_meta: { role },
  })
}

/**
 * Deactivate / reactivate a user. The auth ban needs the service role, so this goes through
 * the admin-users Edge Function (which also flips profiles.active and writes the audit row).
 */
export async function setUserActive({ userId, active }) {
  const { error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'set-active', userId, active },
  })
  if (error) throw new Error(error.message)
}
