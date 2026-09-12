import { Link } from 'react-router-dom'
import { Inbox, FileText, ArrowRight } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { listMySubmissions, listAllSubmissions } from '@/lib/submissions'
import { useAsync } from '@/lib/use-async'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/ui/stat'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loading, ErrorState } from '@/components/page-state'

// Submissions landing: one card per form (like My Forms). Clicking a card opens all
// submissions for that form (/my-submissions/:formId). Managers see everyone's submissions;
// enumerators see their own. RLS already scopes what each role can read.
export function MySubmissionsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'admin' || profile?.role === 'supervisor'

  const { data: subs, loading, error } = useAsync(
    () => (isManager ? listAllSubmissions() : listMySubmissions()),
    [isManager]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submissions"
        description={
          isManager
            ? 'Pick a form to see its submissions.'
            : "Pick a form to see everything you've submitted."
        }
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : subs.length === 0 ? (
        <EmptyState
          text={
            isManager
              ? 'No submissions yet across any form.'
              : 'Forms you complete will appear here, grouped by form.'
          }
        />
      ) : (
        <SubmissionCards subs={subs} isManager={isManager} />
      )}
    </div>
  )
}

function SubmissionCards({ subs, isManager }) {
  // Group by form, newest activity first.
  const byForm = new Map()
  for (const s of subs) {
    if (!byForm.has(s.form_id)) {
      byForm.set(s.form_id, {
        form_id: s.form_id,
        title: s.form_title,
        total: 0,
        awaiting: 0,
        latest: s.submitted_at,
      })
    }
    const g = byForm.get(s.form_id)
    g.total += 1
    if (s.status === 'new') g.awaiting += 1
    if (s.submitted_at > g.latest) g.latest = s.submitted_at
  }
  const forms = [...byForm.values()].sort((a, b) => (a.latest < b.latest ? 1 : -1))

  const totalAwaiting = subs.filter((s) => s.status === 'new').length

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total submissions" value={subs.length} />
        <StatCard label="Forms with data" value={forms.length} />
        <StatCard label={isManager ? 'Awaiting review' : 'Awaiting review'} value={totalAwaiting} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => (
          <Link key={f.form_id} to={`/my-submissions/${f.form_id}`} className="group">
            <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary hover:bg-accent">
              <div className="mb-3 flex items-center justify-between">
                <div className="w-fit rounded-md bg-muted p-2 text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <Badge variant="default">{f.total}</Badge>
              </div>
              <div className="font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {f.total} submission{f.total === 1 ? '' : 's'}
                {f.awaiting > 0 ? ` · ${f.awaiting} awaiting review` : ''}
              </div>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                View submissions
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}

function EmptyState({ text }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">No submissions yet</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </Card>
  )
}
