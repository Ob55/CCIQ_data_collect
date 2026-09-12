// @ts-check
// Review service (PRD §8). Loads the review queue (never the reviewer's own submissions),
// renders a submission against its own schema version for reading, and records review
// actions. Review NEVER mutates submission data — a DB trigger flips status from the
// inserted reviews row; the self-review block is enforced in RLS and re-checked here.
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedAttachmentUrl } from '@/lib/submissions'
import { labelFor, textFor } from '@/lib/runtime-eval'

const SHORT_DURATION_SECONDS = 30

/**
 * Submissions the current user may review, filtered. Excludes their own (§8).
 * @param {string} userId
 * @param {{ status?, submittedBy?, role?, versionId?, from?, to? }} filters
 */
export async function listReviewQueue(userId, filters = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('submissions')
    .select(
      'id, status, submitted_at, submitted_by, submitted_by_role, duration_seconds, geo_lat, form_versions(version_no, forms(title))'
    )
    .neq('submitted_by', userId) // the queue never shows the reviewer their own work
    .order('submitted_at', { ascending: true })
    .limit(200)

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.submittedBy) q = q.eq('submitted_by', filters.submittedBy)
  if (filters.role) q = q.eq('submitted_by_role', filters.role)
  if (filters.versionId) q = q.eq('form_version_id', filters.versionId)
  if (filters.from) q = q.gte('submitted_at', filters.from)
  if (filters.to) q = q.lte('submitted_at', filters.to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []

  // Resolve submitter names in one batch (supervisors can read profiles via 0003).
  const submitterIds = [...new Set(rows.map((r) => r.submitted_by))]
  const names = {}
  if (submitterIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', submitterIds)
    for (const p of profiles ?? []) names[p.id] = p.full_name || p.email
  }

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    submitted_at: r.submitted_at,
    submitted_by: r.submitted_by,
    submitter_name: names[r.submitted_by] ?? 'Unknown',
    submitted_by_role: r.submitted_by_role,
    duration_seconds: r.duration_seconds,
    form_title: r.form_versions?.forms?.title ?? 'Form',
    version_no: r.form_versions?.version_no ?? null,
    hints: qualityHints(r),
  }))
}

/** Cheap per-row quality hints (§8). Outlier detection across submissions is deferred. */
function qualityHints(row) {
  const hints = []
  if (row.duration_seconds != null && row.duration_seconds < SHORT_DURATION_SECONDS) {
    hints.push('Unusually short duration')
  }
  if (row.geo_lat == null) hints.push('No GPS location')
  return hints
}

/** Distinct filter options for the queue toolbar. */
export async function reviewFilterOptions(userId) {
  const supabase = await createClient()
  const { data: submitters } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .neq('id', userId)
    .order('full_name')
  return { submitters: submitters ?? [] }
}

/**
 * Load one submission rendered for reading against its own schema version.
 * @returns {Promise<null | { meta, rows, canReview, isOwn }>}
 */
export async function getReviewItem(userId, submissionId, language) {
  const supabase = await createClient()
  const { data: sub, error } = await supabase
    .from('submissions')
    .select(
      'id, status, submitted_at, submitted_by, submitted_by_role, duration_seconds, geo_lat, geo_lng, data, form_version_id, form_versions(version_no, schema, forms(title))'
    )
    .eq('id', submissionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!sub) return null

  const isOwn = sub.submitted_by === userId
  const schema = sub.form_versions?.schema ?? { fields: [], languages: ['default'] }
  const lang = language || schema.languages?.[0] || 'default'

  // Submitter name.
  const { data: submitter } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', sub.submitted_by)
    .maybeSingle()

  // canReview: not own AND (admin/supervisor, or an explicit can_review grant). RLS still guards
  // the write. Supervisors review like admins (migration 0005).
  let canReview = false
  if (!isOwn) {
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    if (prof?.role === 'admin' || prof?.role === 'supervisor') canReview = true
    else {
      const { data: version } = await supabase
        .from('form_versions')
        .select('form_id')
        .eq('id', sub.form_version_id)
        .maybeSingle()
      if (version) {
        const { data: asg } = await supabase
          .from('assignments')
          .select('can_review')
          .eq('form_id', version.form_id)
          .maybeSingle()
        canReview = Boolean(asg?.can_review)
      }
    }
  }

  const rows = await renderFields(schema.fields ?? [], sub.data ?? {}, lang)

  return {
    meta: {
      id: sub.id,
      status: sub.status,
      submitted_at: sub.submitted_at,
      duration_seconds: sub.duration_seconds,
      geo: sub.geo_lat != null ? { lat: sub.geo_lat, lng: sub.geo_lng } : null,
      submitter_name: submitter?.full_name || submitter?.email || 'Unknown',
      submitted_by_role: sub.submitted_by_role,
      form_title: sub.form_versions?.forms?.title ?? 'Form',
      version_no: sub.form_versions?.version_no ?? null,
      languages: schema.languages ?? ['default'],
    },
    rows,
    canReview,
    isOwn,
  }
}

/** Recursively render fields to display rows (labels not names, photos signed, groups/repeats). */
async function renderFields(fields, scope, language) {
  const out = []
  for (const f of fields) {
    if (f.type === 'note') continue
    if (f.type === 'begin_group') {
      out.push({ kind: 'group', label: labelFor(f, language), children: await renderFields(f.children ?? [], scope, language) })
    } else if (f.type === 'begin_repeat') {
      const arr = Array.isArray(scope[f.name]) ? scope[f.name] : []
      const instances = []
      for (const inst of arr) instances.push(await renderFields(f.children ?? [], inst, language))
      out.push({ kind: 'repeat', label: labelFor(f, language), instances })
    } else {
      out.push({ kind: 'field', label: labelFor(f, language), type: f.type, value: await displayValue(f, scope[f.name], language) })
    }
  }
  return out
}

async function displayValue(field, value, language) {
  if (value === undefined || value === null || value === '') return { text: '—' }
  if (field.type === 'select_one') {
    const c = (field.choices ?? []).find((x) => x.name === value)
    return { text: c ? textFor(c.label, language) || c.name : String(value) }
  }
  if (field.type === 'select_multiple') {
    const tokens = String(value).split(/\s+/).filter(Boolean)
    const labels = tokens.map((t) => {
      const c = (field.choices ?? []).find((x) => x.name === t)
      return c ? textFor(c.label, language) || c.name : t
    })
    return { text: labels.join(', ') }
  }
  if (field.type === 'image') {
    // One or many photos → sign each into a viewable URL.
    const items = Array.isArray(value) ? value : value?.storage_path ? [value] : []
    if (!items.length) return { text: '—' }
    const photos = []
    for (const it of items) {
      if (!it?.storage_path) continue
      try {
        photos.push(await signedAttachmentUrl(it.storage_path))
      } catch {
        // skip unavailable photo
      }
    }
    return photos.length ? { photos } : { text: '(photo unavailable)' }
  }
  if (field.type === 'geopoint') {
    const [lat, lng] = String(value).split(/\s+/)
    return { text: `${lat}, ${lng}`, mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` }
  }
  return { text: String(value) }
}

/**
 * Record a review action. Inserts a reviews row (RLS enforces can_review + the self-review
 * block) and an audit_log row. The submission's status is updated by a DB trigger.
 * @param {{ userId: string, submissionId: string, action: string, comment: string }} input
 */
export async function submitReview({ userId, submissionId, action, comment }) {
  const supabase = await createClient()
  const { error } = await supabase.from('reviews').insert({
    submission_id: submissionId,
    reviewer_id: userId,
    action,
    comment: comment || null,
  })
  if (error) {
    // RLS blocks self-review and unauthorized reviewers => surface as a clear failure.
    throw new Error(
      /row-level security/i.test(error.message)
        ? 'You are not allowed to review this submission.'
        : error.message
    )
  }

  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: userId,
    entity_type: 'submission',
    entity_id: submissionId,
    action: `review.${action}`,
    meta: { comment: comment || null },
  })
}
