import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { storeAttachment } from '@/lib/submissions'

// POST /api/attachments — upload one image for a pending submission. Multipart form-data:
// file, submission_id, question_name. Returns the storage path to reference at submit time.
export async function POST(request) {
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  let form
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = form.get('file')
  const submissionId = form.get('submission_id')
  const questionName = form.get('question_name')
  if (!file || typeof file === 'string' || !submissionId || !questionName) {
    return NextResponse.json({ error: 'Missing file, submission_id or question_name.' }, { status: 400 })
  }

  try {
    const result = await storeAttachment({
      submissionId: String(submissionId),
      questionName: String(questionName),
      file,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
