import { Link } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { listForms } from '@/lib/forms'
import { useAsync } from '@/lib/use-async'
import { PageHeader } from '@/components/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loading, ErrorState } from '@/components/page-state'

export function FormsPage() {
  const { data: forms, loading, error } = useAsync(() => listForms(), [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Build or upload a form, review it, then deploy for collection."
      >
        <Link to="/forms/new" className={buttonVariants()}>
          <Plus className="mr-1.5 h-4 w-4" /> New form
        </Link>
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : forms.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No forms yet</p>
            <p className="text-sm text-muted-foreground">Create your first form to start collecting data.</p>
          </div>
          <Link to="/forms/new" className={buttonVariants()}>
            <Plus className="mr-1.5 h-4 w-4" /> New form
          </Link>
        </Card>
      ) : (
        <Card className="divide-y">
          {forms.map((f) => (
            <Link
              key={f.id}
              to={`/forms/${f.id}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-accent"
            >
              <div className="rounded-md bg-muted p-2 text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground">
                  {f.versionCount} version{f.versionCount === 1 ? '' : 's'}
                  {f.latestVersion ? ` · latest v${f.latestVersion}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {f.deployedCount > 0 ? <Badge variant="deployed">deployed</Badge> : null}
                {f.latestStatus ? <Badge variant={f.latestStatus}>{f.latestStatus}</Badge> : null}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
