import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { generateExport } from '@/lib/export'

// GET /api/export?form_id=&format=&headers=&status=&from=&to= — download an export file.
// Enumerators may not export (§3); enforced here and again by RLS on the underlying reads.
export async function GET(request) {
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  if (current.profile.role === 'enumerator') {
    return NextResponse.json({ error: 'You are not allowed to export.' }, { status: 403 })
  }

  const sp = new URL(request.url).searchParams
  const formId = sp.get('form_id')
  if (!formId) {
    return NextResponse.json({ error: 'form_id is required.' }, { status: 400 })
  }

  try {
    const result = await generateExport({
      userId: current.user.id,
      formId,
      format: sp.get('format') === 'csv' ? 'csv' : 'xlsx',
      headerMode: sp.get('headers') === 'names' ? 'names' : 'labels',
      status: sp.get('status') || '',
      from: sp.get('from') || '',
      to: sp.get('to') || '',
    })

    return new NextResponse(result.body, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Export-Rows': String(result.rows),
        'X-Export-Truncated': String(result.truncated),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
