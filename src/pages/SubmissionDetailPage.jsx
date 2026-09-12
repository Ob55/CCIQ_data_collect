import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { getReviewItem } from '@/lib/review'
import { useAsync } from '@/lib/use-async'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loading, ErrorState } from '@/components/page-state'

// Read-only view of a single submission's data. Access is enforced by RLS via getReviewItem:
// enumerators see only their own; admins/supervisors see all (migration 0005).
export function SubmissionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: item, loading, error } = useAsync(
    () => getReviewItem(user.id, id),
    [user.id, id]
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Loading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState message={error} />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card className="p-10 text-center text-muted-foreground">
          This submission doesn&apos;t exist or you don&apos;t have access to it.
        </Card>
      </div>
    )
  }

  const { meta, rows } = item

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader title={meta.form_title} description={`Submitted by ${meta.submitter_name}`}>
        <Badge variant={meta.status}>{meta.status}</Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        <Meta label="Enumerator" value={meta.submitter_name} />
        <Meta label="Role" value={meta.submitted_by_role} />
        <Meta label="Submitted" value={new Date(meta.submitted_at).toLocaleString()} />
        <Meta label="Version" value={meta.version_no ? `v${meta.version_no}` : '—'} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">This submission has no answers.</p>
          ) : (
            rows.map((row, i) => <Row key={i} row={row} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/my-submissions"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to submissions
    </Link>
  )
}

function Meta({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function Row({ row }) {
  if (row.kind === 'group') {
    return (
      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{row.label}</legend>
        {row.children.map((c, i) => (
          <Row key={i} row={c} />
        ))}
      </fieldset>
    )
  }

  if (row.kind === 'repeat') {
    return (
      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{row.label}</legend>
        {row.instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          row.instances.map((inst, i) => (
            <div key={i} className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="text-xs font-medium text-muted-foreground">
                {row.label} {i + 1}
              </div>
              {inst.map((c, j) => (
                <Row key={j} row={c} />
              ))}
            </div>
          ))
        )}
      </fieldset>
    )
  }

  // leaf field
  return (
    <div className="grid grid-cols-3 gap-3 border-b pb-2 text-sm last:border-0">
      <div className="text-muted-foreground">{row.label}</div>
      <div className="col-span-2">
        {row.value?.photos ? (
          <div className="flex flex-wrap gap-2">
            {row.value.photos.map((src, i) => (
              <img key={i} src={src} alt={`${row.label} ${i + 1}`} className="max-h-48 rounded-md border" />
            ))}
          </div>
        ) : row.value?.photo ? (
          <img src={row.value.photo} alt={row.label} className="max-h-48 rounded-md border" />
        ) : row.value?.mapUrl ? (
          <a href={row.value.mapUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            {row.value.text}
          </a>
        ) : (
          <span className="font-medium">{row.value?.text ?? '—'}</span>
        )}
      </div>
    </div>
  )
}
