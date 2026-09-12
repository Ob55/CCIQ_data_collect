'use server'

import { requireRole } from '@/lib/auth'
import { reviewInputSchema } from '@/lib/schemas'
import { getReviewItem, submitReview } from '@/lib/review'

const REVIEWERS = ['admin', 'supervisor']

/** Load one submission's review detail (server-rendered against its schema version). */
export async function loadReviewItemAction(submissionId, language) {
  const { user } = await requireRole(REVIEWERS)
  const item = await getReviewItem(user.id, submissionId, language)
  if (!item) return { ok: false, error: 'Submission not found.' }
  return { ok: true, item }
}

/** Record a review action. Returns ok, or an error (incl. the self-review block). */
export async function reviewAction(_prev, formData) {
  const { user } = await requireRole(REVIEWERS)
  const parsed = reviewInputSchema.safeParse({
    submission_id: formData.get('submission_id'),
    action: formData.get('action'),
    comment: formData.get('comment') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid review.' }
  }

  try {
    await submitReview({
      userId: user.id,
      submissionId: parsed.data.submission_id,
      action: parsed.data.action,
      comment: parsed.data.comment,
    })
  } catch (err) {
    return { ok: false, error: err.message }
  }
  return { ok: true, action: parsed.data.action, id: parsed.data.submission_id }
}
