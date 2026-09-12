// @ts-check
// Server-side forms service (PRD §5.5, §7). Handles the form/version lifecycle:
// parse+create draft, add versions, deploy/retire, assignments. Every mutation writes an
// audit_log row via the service role (audit_log is server-only).
import 'server-only'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseXlsform } from '@/lib/xlsform/parse'
import { buildRuntimeSchema } from '@/lib/xlsform/builder'
import { XlsformError } from '@/lib/xlsform/errors'

// Re-exported so callers can build a schema and persist it from one module (§5.5).
export { buildRuntimeSchema }

export const XLSFORM_BUCKET = 'xlsform-sources'
export const MAX_XLSFORM_BYTES = 10 * 1024 * 1024 // 10 MB (§10)

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers send this for .xlsx
  '',
])

/** Turn a title into a URL-safe slug with a short unique suffix. */
function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'form'}-${randomUUID().slice(0, 6)}`
}

/** Validate an uploaded File (extension, mime, size) then return its bytes. §10 */
async function readUpload(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new XlsformError('No file was uploaded.')
  }
  if (!file.name?.toLowerCase().endsWith('.xlsx')) {
    throw new XlsformError('The file must be an .xlsx XLSForm workbook.')
  }
  if (!XLSX_MIMES.has(file.type)) {
    throw new XlsformError(`Unexpected file type: ${file.type}`)
  }
  if (file.size > MAX_XLSFORM_BYTES) {
    throw new XlsformError('The file exceeds the 10 MB limit.')
  }
  return Buffer.from(await file.arrayBuffer())
}

/** Parse an upload WITHOUT persisting anything — used for the pre-confirm report (§7). */
export async function parseUploadPreview(file) {
  const buffer = await readUpload(file)
  return parseXlsform(buffer) // throws XlsformError on any problem
}

async function writeAudit(actorId, entityType, entityId, action, meta = {}) {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    meta,
  })
}

/** Upload the original workbook to the private bucket via the service role. */
async function storeSource(formId, versionNo, buffer) {
  const admin = createAdminClient()
  const path = `${formId}/v${versionNo}.xlsx`
  const { error } = await admin.storage.from(XLSFORM_BUCKET).upload(path, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  })
  if (error) throw new Error(`Could not store the source file: ${error.message}`)
  return path
}

/**
 * Parse an upload and create a new form with its first draft version.
 * @param {{ actorId: string, title: string, description?: string, file: File }} input
 * @returns {Promise<{ formId: string, versionId: string }>}
 */
export async function createFormFromUpload({ actorId, title, description, file }) {
  const buffer = await readUpload(file)
  const { schema } = await parseXlsform(buffer)

  const supabase = await createClient()
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .insert({ title, slug: slugify(title), description: description || null, created_by: actorId })
    .select('id')
    .single()
  if (formErr) throw new Error(`Could not create the form: ${formErr.message}`)

  const sourcePath = await storeSource(form.id, 1, buffer)
  const { data: version, error: verErr } = await supabase
    .from('form_versions')
    .insert({
      form_id: form.id,
      version_no: 1,
      schema,
      source_file_path: sourcePath,
      status: 'draft',
    })
    .select('id')
    .single()
  if (verErr) throw new Error(`Could not create the version: ${verErr.message}`)

  await writeAudit(actorId, 'form', form.id, 'form.create', { title })
  await writeAudit(actorId, 'form_version', version.id, 'version.create', { version_no: 1 })
  return { formId: form.id, versionId: version.id }
}

/**
 * Create a form + first draft version from a builder-produced schema (no source workbook).
 * @param {{ actorId: string, title: string, description?: string, schema: import('@/lib/xlsform/schema').FormSchema }} input
 * @returns {Promise<{ formId: string, versionId: string }>}
 */
export async function createFormFromSchema({ actorId, title, description, schema }) {
  const supabase = await createClient()
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .insert({ title, slug: slugify(title), description: description || null, created_by: actorId })
    .select('id')
    .single()
  if (formErr) throw new Error(`Could not create the form: ${formErr.message}`)

  const { data: version, error: verErr } = await supabase
    .from('form_versions')
    .insert({ form_id: form.id, version_no: 1, schema, status: 'draft' })
    .select('id')
    .single()
  if (verErr) throw new Error(`Could not create the version: ${verErr.message}`)

  await writeAudit(actorId, 'form', form.id, 'form.create', { title, source: 'builder' })
  await writeAudit(actorId, 'form_version', version.id, 'version.create', { version_no: 1, source: 'builder' })
  return { formId: form.id, versionId: version.id }
}

/**
 * Parse an upload and add the next draft version to an existing form (§5.5).
 * @param {{ actorId: string, formId: string, file: File }} input
 */
export async function addVersionFromUpload({ actorId, formId, file }) {
  const buffer = await readUpload(file)
  const { schema } = await parseXlsform(buffer)

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('form_versions')
    .select('version_no')
    .eq('form_id', formId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextNo = (last?.version_no ?? 0) + 1

  const sourcePath = await storeSource(formId, nextNo, buffer)
  const { data: version, error } = await supabase
    .from('form_versions')
    .insert({
      form_id: formId,
      version_no: nextNo,
      schema,
      source_file_path: sourcePath,
      status: 'draft',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add the version: ${error.message}`)

  await writeAudit(actorId, 'form_version', version.id, 'version.create', { version_no: nextNo })
  return { versionId: version.id, versionNo: nextNo }
}

/** Deploy a draft version. Immutable versions: we only flip status (§5.5). */
export async function deployVersion({ actorId, versionId }) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('form_versions')
    .update({ status: 'deployed', deployed_at: new Date().toISOString(), deployed_by: actorId })
    .eq('id', versionId)
  if (error) throw new Error(`Could not deploy: ${error.message}`)
  await writeAudit(actorId, 'form_version', versionId, 'version.deploy')
}

/** Retire a version so it no longer accepts new submissions. Old data still renders (§5.5). */
export async function retireVersion({ actorId, versionId }) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('form_versions')
    .update({ status: 'retired' })
    .eq('id', versionId)
  if (error) throw new Error(`Could not retire: ${error.message}`)
  await writeAudit(actorId, 'form_version', versionId, 'version.retire')
}

/**
 * Replace the assignment set for a form (§7). Rows with neither can_fill nor can_review
 * are removed; the rest are upserted.
 * @param {{ actorId: string, formId: string, entries: Array<{user_id: string, can_fill: boolean, can_review: boolean}> }} input
 */
export async function setAssignments({ actorId, formId, entries }) {
  const supabase = await createClient()
  const active = entries.filter((e) => e.can_fill || e.can_review)
  const removed = entries.filter((e) => !e.can_fill && !e.can_review).map((e) => e.user_id)

  if (active.length > 0) {
    const rows = active.map((e) => ({ form_id: formId, ...e }))
    const { error } = await supabase.from('assignments').upsert(rows, { onConflict: 'form_id,user_id' })
    if (error) throw new Error(`Could not save assignments: ${error.message}`)
  }
  if (removed.length > 0) {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('form_id', formId)
      .in('user_id', removed)
    if (error) throw new Error(`Could not update assignments: ${error.message}`)
  }
  await writeAudit(actorId, 'form', formId, 'form.assign', { count: active.length })
}

/** Forms visible to the current user, with latest-version status and submission counts. */
export async function listForms() {
  const supabase = await createClient()
  const { data: forms, error } = await supabase
    .from('forms')
    .select('id, title, slug, created_at, archived_at, form_versions(id, version_no, status)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (forms ?? []).map((f) => {
    const versions = f.form_versions ?? []
    const latest = versions.slice().sort((a, b) => b.version_no - a.version_no)[0]
    const deployed = versions.filter((v) => v.status === 'deployed').length
    return {
      id: f.id,
      title: f.title,
      slug: f.slug,
      created_at: f.created_at,
      versionCount: versions.length,
      latestVersion: latest?.version_no ?? null,
      latestStatus: latest?.status ?? null,
      deployedCount: deployed,
    }
  })
}

/** Full detail for one form: versions (newest first) + current assignments. */
export async function getFormDetail(formId) {
  const supabase = await createClient()
  const { data: form, error } = await supabase
    .from('forms')
    .select('id, title, slug, description, created_at, created_by')
    .eq('id', formId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!form) return null

  const { data: versions } = await supabase
    .from('form_versions')
    .select('id, version_no, status, deployed_at, source_file_path, created_at, schema')
    .eq('form_id', formId)
    .order('version_no', { ascending: false })

  const { data: assignments } = await supabase
    .from('assignments')
    .select('user_id, can_fill, can_review')
    .eq('form_id', formId)

  return { form, versions: versions ?? [], assignments: assignments ?? [] }
}

/**
 * List users a supervisor/admin may assign. Reads through RLS — admins and supervisors are
 * both allowed to read all profiles (migration 0003), so no service-role escalation is needed.
 */
export async function listAssignableUsers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('active', true)
    .order('role')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}
