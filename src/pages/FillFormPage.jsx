import { useParams } from 'react-router-dom'
import { getFillContext } from '@/lib/submissions'
import { useAsync } from '@/lib/use-async'
import { FormFill } from '@/components/form-fill/form-fill'
import { Card } from '@/components/ui/card'
import { Loading, ErrorState } from '@/components/page-state'

export function FillFormPage() {
  const { slug } = useParams()
  const { data: ctx, loading, error } = useAsync(() => getFillContext(slug), [slug])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  if (!ctx) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center text-muted-foreground">
        This form doesn&apos;t exist or has no deployed version.
      </Card>
    )
  }
  if (!ctx.canFill) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center text-muted-foreground">
        You are not assigned to fill this form. Ask a supervisor for access.
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <FormFill form={ctx.form} version={ctx.version} />
    </div>
  )
}
