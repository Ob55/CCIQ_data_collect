import Link from 'next/link'
import { Inbox, ChevronRight } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { listMySubmissions, listAllSubmissions } from '@/lib/submissions'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/ui/stat'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Submissions — CleanCook' }

export default async function SubmissionsPage() {
  const { profile } = await requireUser()
  const isManager = profile.role === 'admin' || profile.role === 'supervisor'

  return isManager ? <AllSubmissions /> : <MySubmissions />
}

// Admin / supervisor: every submission, grouped by form. Click any to see the full response.
async function AllSubmissions() {
  const subs = await listAllSubmissions()

  // Group by form, preserving newest-first order within each group.
  const groups = new Map()
  for (const s of subs) {
    if (!groups.has(s.form_id)) groups.set(s.form_id, { title: s.form_title, items: [] })
    groups.get(s.form_id).items.push(s)
  }
  const forms = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="space-y-6">
      <PageHeader title="Submissions" description="Every submission, grouped by form. Click one to view its data." />

      {subs.length === 0 ? (
        <EmptyState text="No submissions yet across any form." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total submissions" value={subs.length} />
            <StatCard label="Forms with data" value={forms.length} />
            <StatCard label="Awaiting review" value={subs.filter((s) => s.status === 'new').length} />
          </div>

          <div className="space-y-4">
            {forms.map((g) => (
              <Card key={g.title} className="overflow-hidden">
                <details open>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 border-b bg-muted/40 p-4 font-medium">
                    <span className="truncate">{g.title}</span>
                    <Badge variant="default">{g.items.length}</Badge>
                  </summary>
                  <ul className="divide-y">
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/submissions/${s.id}`}
                          className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{s.submitter_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {s.submitted_by_role} · v{s.version_no} ·{' '}
                              {new Date(s.submitted_at).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.status}>{s.status}</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Enumerator: their own submissions with status, each clickable to the full response.
async function MySubmissions() {
  const submissions = await listMySubmissions()
  const count = (status) => submissions.filter((s) => s.status === status).length

  return (
    <div className="space-y-6">
      <PageHeader title="Submissions" description="Everything you've submitted and its review status." />

      {submissions.length === 0 ? (
        <EmptyState text="Forms you complete will appear here with their status." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Total" value={submissions.length} />
            <StatCard label="Approved" value={count('approved')} />
            <StatCard label="Awaiting review" value={count('new')} />
            <StatCard label="Needs changes" value={count('flagged') + count('rejected')} />
          </div>

          <Card className="divide-y">
            {submissions.map((s) => (
              <Link
                key={s.id}
                href={`/submissions/${s.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.form_title}</div>
                  <div className="text-xs text-muted-foreground">
                    v{s.version_no} · {new Date(s.submitted_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.status}>{s.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
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
