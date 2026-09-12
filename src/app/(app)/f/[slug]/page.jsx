import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getFillContext } from '@/lib/submissions'
import { FormFill } from '@/components/form-fill/form-fill'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Fill form — CleanCook' }

export default async function FillPage({ params }) {
  await requireUser()
  const { slug } = await params
  const ctx = await getFillContext(slug)
  if (!ctx) notFound()

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
