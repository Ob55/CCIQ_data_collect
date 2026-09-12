import { requireRole } from '@/lib/auth'
import { listReviewQueue, reviewFilterOptions } from '@/lib/review'
import { ReviewClient } from './review-client'

export const metadata = { title: 'Review — CleanCook' }

// The review queue (§8). Filters come from the query string; the client renders one
// submission at a time and navigates with the keyboard.
export default async function ReviewPage({ searchParams }) {
  const { user } = await requireRole(['admin', 'supervisor'])
  const sp = await searchParams

  const filters = {
    status: sp.status || '',
    submittedBy: sp.submittedBy || '',
    role: sp.role || '',
    from: sp.from || '',
    to: sp.to || '',
  }

  const [queue, options] = await Promise.all([
    listReviewQueue(user.id, filters),
    reviewFilterOptions(user.id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-muted-foreground">
          {queue.length} submission{queue.length === 1 ? '' : 's'} to review · shortcuts: J/K move, A approve, F flag
        </p>
      </div>
      <ReviewClient queue={queue} submitters={options.submitters} filters={filters} />
    </div>
  )
}
