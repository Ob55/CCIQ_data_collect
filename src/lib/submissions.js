// @ts-check
// Runtime data-collection service (PRD §4, §6, §7). Loads deployed forms for filling,
// records submissions idempotently, and lists a user's own submissions.
import { createClient, supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { submissionInputSchema } from '@/lib/schemas'

export const ATTACHMENT_BUCKET = 'attachments'
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // §10

// ---------------------------------------------------------------------------
// Loading forms to fill
// ---------------------------------------------------------------------------

/** Deployed forms the current user is assigned to fill (§7 "My forms"). Admins see every
 * deployed form, since they may fill anything (assignment is not required for admins). */
export async function listFillableForms() {
  const supabase = await createClient()

  const current = await getCurrentUser()
  if (current?.profile.role === 'admin') {
    // Admins can fill any deployed form — list one entry per form with a deployed version.
    const { data: deployed } = await supabase
      .from('form_versions')
      .select('form_id, forms(id, title, slug, description)')
      .eq('status', 'deployed')
    const byForm = new Map()
    for (const v of deployed ?? []) {
      if (v.forms && !byForm.has(v.form_id)) {
        byForm.set(v.form_id, {
          id: v.forms.id,
          title: v.forms.title,
          slug: v.forms.slug,
          description: v.forms.description,
        })
      }
    }
    return [...byForm.values()]
  }

  const { data: asgs } = await supabase
    .from('assignments')
    .select('form_id, forms(id, title, slug, description)')
    .eq('can_fill', true)
  if (!asgs || asgs.length === 0) return []

  const formIds = asgs.map((a) => a.form_id)
  const { data: deployed } = await supabase
    .from('form_versions')
    .select('form_id')
    .eq('status', 'deployed')
    .in('form_id', formIds)
  const deployedSet = new Set((deployed ?? []).map((d) => d.form_id))

  return asgs
    .filter((a) => a.forms && deployedSet.has(a.form_id))
    .map((a) => ({ id: a.forms.id, title: a.forms.title, slug: a.forms.slug, description: a.forms.description }))
}

/**
 * Resolve the fill context for a slug: the form + its latest deployed version + whether
 * the current user may fill it. Returns null if the form/version isn't visible (RLS) or
 * no deployed version exists.
 */
export async function getFillContext(slug) {
  const supabase = await createClient()
  const { data: form } = await supabase
    .from('forms')
    .select('id, title, slug, description')
    .eq('slug', slug)
    .maybeSingle()
  if (!form) return null

  const { data: version } = await supabase
    .from('form_versions')
    .select('id, version_no, schema, status')
    .eq('form_id', form.id)
    .eq('status', 'deployed')
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!version) return null

  const current = await getCurrentUser()
  const isAdmin = current?.profile.role === 'admin'

  const { data: assignment } = await supabase
    .from('assignments')
    .select('can_fill')
    .eq('form_id', form.id)
    .maybeSingle()

  // Admins may fill any deployed form; everyone else needs a can_fill assignment.
  return { form, version, canFill: isAdmin || Boolean(assignment?.can_fill) }
}

/** The current user's own submissions, newest first (§7 "My submissions"). Explicitly scoped
 * to submitted_by = me, so an enumerator who happens to hold a review grant still only sees
 * their OWN submissions here (RLS alone would also expose reviewable rows). */
export async function listMySubmissions() {
  const supabase = await createClient()
  const current = await getCurrentUser()
  if (!current) return []
  const { data } = await supabase
    .from('submissions')
    .select('id, status, submitted_at, form_versions(version_no, forms(id, title))')
    .eq('submitted_by', current.user.id)
    .order('submitted_at', { ascending: false })
  return (data ?? []).map((s) => ({
    id: s.id,
    status: s.status,
    submitted_at: s.submitted_at,
    version_no: s.form_versions?.version_no ?? null,
    form_id: s.form_versions?.forms?.id ?? 'unknown',
    form_title: s.form_versions?.forms?.title ?? 'Form',
  }))
}

/**
 * All submissions the current user may see, newest first (RLS-scoped: admins + supervisors see
 * everything, enumerators only their own). Used by the grouped "all submissions" browser (§7).
 * @returns {Promise<Array<{ id: string, status: string, submitted_at: string, submitter_name: string, submitted_by_role: string, version_no: number|null, form_id: string, form_title: string }>>}
 */
export async function listAllSubmissions() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select(
      'id, status, submitted_at, submitted_by, submitted_by_role, form_version_id, form_versions(version_no, forms(id, title))'
    )
    .order('submitted_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)
  const rows = data ?? []

  // Resolve submitter names in one batch (admins/supervisors can read profiles).
  const ids = [...new Set(rows.map((r) => r.submitted_by))]
  const names = {}
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
    for (const p of profs ?? []) names[p.id] = p.full_name || p.email
  }

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    submitted_at: r.submitted_at,
    submitter_name: names[r.submitted_by] ?? 'Unknown',
    submitted_by_role: r.submitted_by_role,
    version_no: r.form_versions?.version_no ?? null,
    form_id: r.form_versions?.forms?.id ?? 'unknown',
    form_title: r.form_versions?.forms?.title ?? 'Form',
  }))
}

// ---------------------------------------------------------------------------
// Recording submissions
// ---------------------------------------------------------------------------

/**
 * Insert a submission idempotently (§6). The browser-generated UUID is the primary key;
 * a duplicate insert (double-tap / retry) is a no-op and does NOT create a second row or
 * duplicate attachments.
 * @param {{ userId: string, role: string, input: import('zod').infer<any> }} args
 * @returns {Promise<{ created: boolean }>}
 */
export async function recordSubmission({ userId, role, input }) {
  const supabase = await createClient()

  const row = {
    id: input.id,
    form_version_id: input.form_version_id,
    submitted_by: userId,
    submitted_by_role: role,
    data: input.data ?? {},
    started_at: input.started_at ?? null,
    duration_seconds: input.duration_seconds ?? null,
    geo_lat: input.geo_lat ?? null,
    geo_lng: input.geo_lng ?? null,
    user_agent: input.user_agent ?? null,
  }

  const { error } = await supabase.from('submissions').insert(row)
  if (error) {
    // 23505 = unique_violation on the PK => this submission already exists. Idempotent success.
    if (error.code === '23505') return { created: false }
    throw new Error(error.message)
  }

  // Attach files only on first creation, so retries never duplicate them.
  if (input.attachments?.length) {
    const rows = input.attachments.map((a) => ({ submission_id: input.id, ...a }))
    const { error: aErr } = await supabase.from('attachments').insert(rows)
    if (aErr) throw new Error(`Submission saved but attachments failed: ${aErr.message}`)
  }

  return { created: true }
}

/**
 * Client submit flow (replaces the old POST /api/submissions route). Validates input,
 * applies the same per-user rate limit, then records the submission idempotently under the
 * current user's session (RLS enforces authorization). Returns { created }.
 * @param {import('zod').infer<typeof submissionInputSchema>} input
 */
export async function submitFilledForm(input) {
  const current = await getCurrentUser()
  if (!current) throw new Error('Not authenticated.')

  const parsed = submissionInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid submission.')
  }

  const limit = await rateLimit(`submit:${current.user.id}`, 30, 60)
  if (!limit.ok) throw new Error('Too many submissions. Please slow down.')

  return recordSubmission({
    userId: current.user.id,
    role: current.profile.role,
    input: parsed.data,
  })
}

/**
 * Store an uploaded image in the private attachments bucket and return its path. Called
 * per-image before submit; the path is then referenced in the submission body.
 * @param {{ submissionId: string, questionName: string, file: File }} args
 */
export async function storeAttachment({ submissionId, questionName, file }) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Only image files are allowed.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 10 MB limit.')
  }
  const ext = file.name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  // Random suffix so multiple photos for the same question never collide/overwrite.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = `${submissionId}/${questionName}-${unique}.${ext}`
  // Upload the File directly from the browser (storage RLS governs access — migration 0009).
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return { storage_path: path, mime_type: file.type, size_bytes: file.size }
}

/** Signed URL for viewing a private attachment (used by the review queue + exports). */
export async function signedAttachmentUrl(storagePath, expiresIn = 300) {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
