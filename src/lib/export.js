// @ts-check
// Export service (PRD §9). Reads submissions through RLS (so supervisors only export forms
// they can review, admins all), flattens them into XLSX/CSV, and writes an audit entry.
import 'server-only'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedAttachmentUrl } from '@/lib/submissions'
import { mergeSchemas, buildSheets, collectImagePaths } from '@/lib/export-build'

// Beyond this, an export would risk the serverless memory/time budget. A true streaming
// background job (§9) is the next step; today we cap and flag rather than silently truncate.
export const EXPORT_ROW_CAP = 20000
// Signed image URLs are embedded in the downloaded file, so anyone holding that file can open
// the photos until the URL expires. Household photos are sensitive (§10), so bound the exposure
// window to 24h — long enough to open a same-day export, short enough to limit leakage. If
// analysts need long-lived images, re-sign the stored path on demand rather than baking a
// long-lived URL into the export.
const SIGNED_URL_TTL = 86400 // 24 hours

/** Forms the current user can export (RLS-scoped). */
export async function listExportableForms() {
  const supabase = await createClient()
  const { data } = await supabase.from('forms').select('id, title').order('title')
  return data ?? []
}

function excelSheetName(name) {
  // Excel: <=31 chars, none of : \ / ? * [ ]
  return (name || 'repeat').replace(/[:\\/?*[\]]/g, '_').slice(0, 31)
}

/**
 * Generate an export file.
 * @param {{ userId, formId, format?: 'xlsx'|'csv', headerMode?: 'names'|'labels', status?, from?, to? }} opts
 * @returns {Promise<{ filename: string, contentType: string, body: Buffer|string, rows: number, truncated: boolean, repeatsOmitted: boolean }>}
 */
export async function generateExport({
  userId,
  formId,
  format = 'xlsx',
  headerMode = 'labels',
  status = '',
  from = '',
  to = '',
}) {
  const supabase = await createClient()

  const { data: form } = await supabase
    .from('forms')
    .select('id, title, slug')
    .eq('id', formId)
    .maybeSingle()
  if (!form) throw new Error('Form not found or not accessible.')

  const { data: versions } = await supabase
    .from('form_versions')
    .select('id, version_no, schema')
    .eq('form_id', formId)
    .order('version_no')
  if (!versions || versions.length === 0) throw new Error('This form has no versions.')

  const lang = versions[0].schema?.languages?.[0] || 'default'
  const merged = mergeSchemas(versions, lang)
  const versionNo = Object.fromEntries(versions.map((v) => [v.id, v.version_no]))

  let q = supabase
    .from('submissions')
    .select('id, submitted_by, submitted_by_role, submitted_at, duration_seconds, status, form_version_id, data')
    .in('form_version_id', versions.map((v) => v.id))
    .order('submitted_at', { ascending: true })
    .limit(EXPORT_ROW_CAP)
  if (status) q = q.eq('status', status)
  if (from) q = q.gte('submitted_at', from)
  if (to) q = q.lte('submitted_at', to)
  const { data: subs, error } = await q
  if (error) throw new Error(error.message)
  const submissions = subs ?? []

  // Resolve enumerator names.
  const submitterIds = [...new Set(submissions.map((s) => s.submitted_by))]
  const names = {}
  if (submitterIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', submitterIds)
    for (const p of profs ?? []) names[p.id] = p.full_name || p.email
  }

  // Latest review comment per submission.
  const subIds = submissions.map((s) => s.id)
  const comments = {}
  if (subIds.length) {
    const { data: revs } = await supabase
      .from('reviews')
      .select('submission_id, comment, created_at')
      .in('submission_id', subIds)
      .order('created_at', { ascending: false })
    for (const r of revs ?? []) {
      if (!(r.submission_id in comments) && r.comment) comments[r.submission_id] = r.comment
    }
  }

  // Sign image URLs once per unique path.
  const paths = new Set()
  for (const s of submissions) collectImagePaths(s.data, paths)
  const imageUrlMap = {}
  for (const p of paths) {
    try {
      imageUrlMap[p] = await signedAttachmentUrl(p, SIGNED_URL_TTL)
    } catch {
      // leave unsigned; the raw path is exported instead
    }
  }

  const prepared = submissions.map((s) => ({
    id: s.id,
    enumerator: names[s.submitted_by] || 'Unknown',
    role: s.submitted_by_role,
    submitted_at: s.submitted_at,
    duration: s.duration_seconds,
    status: s.status,
    comment: comments[s.id] || '',
    version_no: versionNo[s.form_version_id] ?? '',
    data: s.data || {},
  }))

  const sheets = buildSheets({ merged, submissions: prepared, headerMode, imageUrlMap })
  const truncated = prepared.length >= EXPORT_ROW_CAP

  // Audit every export (§9).
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: userId,
    entity_type: 'form',
    entity_id: formId,
    action: 'export',
    meta: { format, headerMode, status, from, to, rows: prepared.length, truncated },
  })

  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(sheets.main))
    return {
      filename: `${form.slug}-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: csv,
      rows: prepared.length,
      truncated,
      repeatsOmitted: sheets.repeats.length > 0, // CSV can't hold multiple sheets
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.main), 'Submissions')
  for (const r of sheets.repeats) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.aoa), excelSheetName(r.name))
  }
  const body = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return {
    filename: `${form.slug}-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body,
    rows: prepared.length,
    truncated,
    repeatsOmitted: false,
  }
}
