import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { listMySubmissions, listAllSubmissions } from '@/lib/submissions'
import { useAsync } from '@/lib/use-async'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loading, ErrorState } from '@/components/page-state'

// All submissions for one form (reached from a Submissions card). Managers see everyone's;
// enumerators see their own. Each row opens the full response at /submissions/:id.
export function FormSubmissionsPage() {
  const { formId } = useParams()
  const { profile } = useAuth()
  const isManager = profile?.role === 'admin' || profile?.role === 'supervisor'

  const { data: subs, loading, error } = useAsync(
    () => (isManager ? listAllSubmissions() : listMySubmissions()),
    [isManager]
  )

  const backLink = (
    <Link to="/my-submissions" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" /> All forms
    </Link>
  )

  if (loading) return <Wrap back={backLink}><Loading /></Wrap>
  if (error) return <Wrap back={backLink}><ErrorState message={error} /></Wrap>

  const rows = subs.filter((s) => s.form_id === formId)
  const title = rows[0]?.form_title || 'Submissions'

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={title}
        description={`${rows.length} submission${rows.length === 1 ? '' : 's'}.`}
      />

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No submissions for this form yet.
        </Card>
      ) : (
        <Card className="divide-y">
          {rows.map((s) => (
            <Link
              key={s.id}
              to={`/submissions/${s.id}`}
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {isManager ? s.submitter_name : s.form_title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isManager ? `${s.submitted_by_role} · ` : ''}v{s.version_no} ·{' '}
                  {new Date(s.submitted_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={s.status}>{s.status}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}

function Wrap({ back, children }) {
  return (
    <div className="space-y-6">
      {back}
      <PageHeader title="Submissions" />
      {children}
    </div>
  )
}
