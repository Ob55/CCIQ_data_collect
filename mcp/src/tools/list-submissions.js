// @ts-check
import { z } from 'zod'
import { resolveForm, listVersions } from '../lib/db.js'

const MAX_LIMIT = 500

export default {
  name: 'list_submissions',
  description:
    'List submissions for a form, newest first, with filters. Returns compact summaries ' +
    '(id, status, submitter, submitted_at, duration) plus the total matching count. Use ' +
    'get_submission for the full rendered record.',
  inputSchema: {
    slug: z.string().optional().describe('Form slug (from list_forms).'),
    formId: z.string().uuid().optional().describe('Form id (alternative to slug).'),
    status: z
      .enum(['new', 'approved', 'flagged', 'rejected'])
      .optional()
      .describe('Filter by review status.'),
    submittedByRole: z
      .enum(['admin', 'supervisor', 'enumerator'])
      .optional()
      .describe('Filter by the role of the submitter.'),
    enumeratorEmail: z
      .string()
      .optional()
      .describe('Filter to submissions by this user (matched on profile email).'),
    from: z.string().optional().describe('ISO date/time lower bound on submitted_at.'),
    to: z.string().optional().describe('ISO date/time upper bound on submitted_at.'),
    limit: z.number().int().positive().max(MAX_LIMIT).optional().describe(`Max rows (default 50, cap ${MAX_LIMIT}).`),
    offset: z.number().int().nonnegative().optional().describe('Rows to skip (pagination).'),
  },
  /**
   * @param {{ slug?, formId?, status?, submittedByRole?, enumeratorEmail?, from?, to?, limit?, offset? }} args
   */
  async handler(args, { supabase }) {
    const { slug, formId, status, submittedByRole, enumeratorEmail, from, to } = args
    const limit = Math.min(args.limit ?? 50, MAX_LIMIT)
    const offset = args.offset ?? 0

    const form = await resolveForm(supabase, { slug, formId })
    const versions = await listVersions(supabase, form.id)
    if (versions.length === 0) return { form: { id: form.id, slug: form.slug }, total: 0, submissions: [] }
    const versionNoById = new Map(versions.map((v) => [v.id, v.version_no]))
    const versionIds = versions.map((v) => v.id)

    // Optionally resolve enumerator email -> profile id.
    let enumeratorId
    if (enumeratorEmail) {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', enumeratorEmail)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!prof) return { form: { id: form.id, slug: form.slug }, total: 0, submissions: [] }
      enumeratorId = prof.id
    }

    const applyFilters = (q) => {
      let out = q.in('form_version_id', versionIds)
      if (status) out = out.eq('status', status)
      if (submittedByRole) out = out.eq('submitted_by_role', submittedByRole)
      if (enumeratorId) out = out.eq('submitted_by', enumeratorId)
      if (from) out = out.gte('submitted_at', from)
      if (to) out = out.lte('submitted_at', to)
      return out
    }

    // Total matching count (head request, no rows transferred).
    const { count, error: cErr } = await applyFilters(
      supabase.from('submissions').select('id', { count: 'exact', head: true })
    )
    if (cErr) throw new Error(cErr.message)

    // Page of rows.
    const { data: subs, error } = await applyFilters(
      supabase
        .from('submissions')
        .select('id, form_version_id, submitted_by, submitted_by_role, status, submitted_at, duration_seconds')
    )
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw new Error(error.message)
    const rows = subs ?? []

    // Resolve submitter names.
    const ids = [...new Set(rows.map((s) => s.submitted_by))]
    const byId = new Map()
    if (ids.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids)
      if (pErr) throw new Error(pErr.message)
      for (const p of profs ?? []) byId.set(p.id, p)
    }

    return {
      form: { id: form.id, title: form.title, slug: form.slug },
      total: count ?? rows.length,
      limit,
      offset,
      submissions: rows.map((s) => {
        const p = byId.get(s.submitted_by)
        return {
          id: s.id,
          status: s.status,
          submitted_at: s.submitted_at,
          duration_seconds: s.duration_seconds,
          version_no: versionNoById.get(s.form_version_id) ?? null,
          submitted_by: {
            id: s.submitted_by,
            name: p?.full_name || p?.email || 'Unknown',
            email: p?.email ?? null,
            role: s.submitted_by_role,
          },
        }
      }),
    }
  },
}
