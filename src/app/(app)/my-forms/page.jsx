import Link from 'next/link'
import { FileText, ArrowRight, ClipboardList } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { listFillableForms } from '@/lib/submissions'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'My Forms — CleanCook' }

// Deployed forms this user is assigned to fill (§7). Identical entry point for every role.
export default async function MyFormsPage() {
  await requireUser()
  const forms = await listFillableForms()

  return (
    <div className="space-y-6">
      <PageHeader title="My Forms" description="Forms you're assigned to fill in." />

      {forms.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <ClipboardList className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nothing to fill yet</p>
            <p className="text-sm text-muted-foreground">
              A supervisor will assign forms to you. They&apos;ll show up here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {forms.map((f) => (
            <Link key={f.id} href={`/f/${f.slug}`} className="group">
              <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary hover:bg-accent">
                <div className="mb-3 w-fit rounded-md bg-muted p-2 text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="font-medium">{f.title}</div>
                {f.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{f.description}</p>
                ) : null}
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                  Open form
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
