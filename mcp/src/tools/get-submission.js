// @ts-check
import { z } from 'zod'
import { schemaLang } from '../lib/db.js'
import { renderSubmission, collectImagePaths } from '../lib/schema.js'

const ATTACHMENT_BUCKET = 'attachments'
const SIGNED_URL_TTL = 300 // seconds — short-lived, matches src/lib/submissions.js

export default {
  name: 'get_submission',
  description:
    'Get one submission rendered against its own form version: question labels with values, ' +
    'repeat groups as arrays, submitter and review metadata, and short-lived signed URLs for ' +
    'any photo attachments.',
  inputSchema: {
    submissionId: z.string().uuid().describe('Submission id (from list_submissions).'),
  },
  /** @param {{ submissionId: string }} args */
  async handler({ submissionId }, { supabase }) {
    const { data: sub, error } = await supabase
      .from('submissions')
      .select(
        'id, form_version_id, submitted_by, submitted_by_role, data, status, ' +
          'started_at, submitted_at, duration_seconds, geo_lat, geo_lng'
      )
      .eq('id', submissionId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!sub) throw new Error(`Submission ${submissionId} not found.`)

    // The version this submission was collected against (PRD §5.5 — renders under its own schema).
    const { data: version, error: vErr } = await supabase
      .from('form_versions')
      .select('version_no, schema, forms(title, slug)')
      .eq('id', sub.form_version_id)
      .maybeSingle()
    if (vErr) throw new Error(vErr.message)

    // Submitter, review history, attachment records.
    const [{ data: profile }, { data: reviews }, { data: attachments }] = await Promise.all([
      supabase.from('profiles').select('full_name, email, role').eq('id', sub.submitted_by).maybeSingle(),
      supabase
        .from('reviews')
        .select('action, comment, created_at, reviewer_id')
        .eq('submission_id', sub.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('attachments')
        .select('question_name, storage_path, mime_type, size_bytes')
        .eq('submission_id', sub.id),
    ])

    // Sign every image path (from the data payload and the attachments table).
    const paths = new Set()
    collectImagePaths(sub.data, paths)
    for (const a of attachments ?? []) if (a.storage_path) paths.add(a.storage_path)

    const imageUrlMap = {}
    for (const p of paths) {
      const { data: signed } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(p, SIGNED_URL_TTL)
      if (signed?.signedUrl) imageUrlMap[p] = signed.signedUrl
    }

    const lang = schemaLang(version?.schema)

    return {
      id: sub.id,
      form: { title: version?.forms?.title ?? null, slug: version?.forms?.slug ?? null },
      version_no: version?.version_no ?? null,
      status: sub.status,
      submitted_by: {
        id: sub.submitted_by,
        name: profile?.full_name || profile?.email || 'Unknown',
        email: profile?.email ?? null,
        role: sub.submitted_by_role,
      },
      submitted_at: sub.submitted_at,
      started_at: sub.started_at,
      duration_seconds: sub.duration_seconds,
      location:
        sub.geo_lat != null && sub.geo_lng != null ? { lat: sub.geo_lat, lng: sub.geo_lng } : null,
      answers: renderSubmission(version?.schema, sub.data, lang, imageUrlMap),
      attachments: (attachments ?? []).map((a) => ({
        question_name: a.question_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        url: imageUrlMap[a.storage_path] ?? null,
      })),
      reviews: (reviews ?? []).map((r) => ({
        action: r.action,
        comment: r.comment,
        created_at: r.created_at,
        reviewer_id: r.reviewer_id,
      })),
    }
  },
}
