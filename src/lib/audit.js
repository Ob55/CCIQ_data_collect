// @ts-check
// Audit log reader (PRD §7 screen 7). Admin-only (enforced by RLS on audit_log and by
// requireRole at the page). Read-only; the log is never updated or deleted.
import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * @param {{ action?: string, entityType?: string, from?: string, to?: string }} filters
 */
export async function listAudit(filters = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('audit_log')
    .select('id, actor_id, entity_type, entity_id, action, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.action) q = q.ilike('action', `${filters.action}%`)
  if (filters.entityType) q = q.eq('entity_type', filters.entityType)
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to) q = q.lte('created_at', filters.to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []

  // Resolve actor names.
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))]
  const names = {}
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds)
    for (const p of profs ?? []) names[p.id] = p.full_name || p.email
  }

  return rows.map((r) => ({ ...r, actor_name: r.actor_id ? names[r.actor_id] || 'Unknown' : 'System' }))
}
