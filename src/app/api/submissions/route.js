import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { submissionInputSchema } from '@/lib/schemas'
import { recordSubmission } from '@/lib/submissions'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/submissions — idempotent submit (§6). Authorization is enforced here AND by RLS.
export async function POST(request) {
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const limit = await rateLimit(`submit:${current.user.id}`, 30, 60)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many submissions. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = submissionInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid submission.', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    const result = await recordSubmission({
      userId: current.user.id,
      role: current.profile.role,
      input: parsed.data,
    })
    // Same 200 whether newly created or a duplicate retry — the client can't tell, by design.
    return NextResponse.json({ ok: true, id: parsed.data.id, created: result.created })
  } catch (err) {
    // An RLS denial (e.g. not assigned can_fill) surfaces as an error here => 403.
    return NextResponse.json({ error: err.message }, { status: 403 })
  }
}
