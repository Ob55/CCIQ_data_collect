import { requireRole } from '@/lib/auth'
import { CreateForm } from './create-form'

export const metadata = { title: 'New form — CleanCook' }

export default async function NewFormPage() {
  await requireRole(['admin', 'supervisor'])
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New form</h1>
        <p className="text-muted-foreground">
          Build a form question by question, or import an existing <code>.xlsx</code> XLSForm.
        </p>
      </div>
      <CreateForm />
    </div>
  )
}
