// @ts-check
import { z } from 'zod'

export default {
  name: 'list_forms',
  description:
    'List CleanCook forms with their versions (version number, status, deploy date) and total ' +
    'submission count. Use this to discover form slugs/ids for the other tools.',
  inputSchema: {
    includeArchived: z
      .boolean()
      .optional()
      .describe('Include archived forms (default false).'),
  },
  /** @param {{ includeArchived?: boolean }} args */
  async handler({ includeArchived = false }, { supabase }) {
    let q = supabase
      .from('forms')
      .select('id, title, slug, description, archived_at')
      .order('title', { ascending: true })
    if (!includeArchived) q = q.is('archived_at', null)
    const { data: forms, error } = await q
    if (error) throw new Error(error.message)
    if (!forms || forms.length === 0) return { forms: [] }

    const formIds = forms.map((f) => f.id)

    // Versions per form.
    const { data: versions, error: vErr } = await supabase
      .from('form_versions')
      .select('id, form_id, version_no, status, deployed_at')
      .in('form_id', formIds)
      .order('version_no', { ascending: true })
    if (vErr) throw new Error(vErr.message)

    const versionsByForm = new Map()
    const formIdByVersion = new Map()
    for (const v of versions ?? []) {
      if (!versionsByForm.has(v.form_id)) versionsByForm.set(v.form_id, [])
      versionsByForm.get(v.form_id).push({
        id: v.id,
        version_no: v.version_no,
        status: v.status,
        deployed_at: v.deployed_at,
      })
      formIdByVersion.set(v.id, v.form_id)
    }

    // Submission counts, tallied per form via each form's version ids.
    const counts = new Map(formIds.map((id) => [id, 0]))
    const versionIds = [...formIdByVersion.keys()]
    if (versionIds.length) {
      const { data: subs, error: sErr } = await supabase
        .from('submissions')
        .select('form_version_id')
        .in('form_version_id', versionIds)
      if (sErr) throw new Error(sErr.message)
      for (const s of subs ?? []) {
        const fid = formIdByVersion.get(s.form_version_id)
        if (fid) counts.set(fid, (counts.get(fid) ?? 0) + 1)
      }
    }

    return {
      forms: forms.map((f) => ({
        id: f.id,
        title: f.title,
        slug: f.slug,
        description: f.description,
        archived: Boolean(f.archived_at),
        versions: versionsByForm.get(f.id) ?? [],
        submission_count: counts.get(f.id) ?? 0,
      })),
    }
  },
}
