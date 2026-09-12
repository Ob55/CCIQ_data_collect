import Link from 'next/link'
import {
  FileText,
  Inbox,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  Users as UsersIcon,
  Plus,
  ArrowRight,
} from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { listForms } from '@/lib/forms'
import { listFillableForms, listMySubmissions } from '@/lib/submissions'
import { listReviewQueue } from '@/lib/review'
import { listUsers } from '@/lib/users'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/ui/stat'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata = { title: 'Dashboard — CleanCook' }

export default async function DashboardPage() {
  const { user, profile } = await requireUser()
  const isManager = profile.role === 'admin' || profile.role === 'supervisor'

  const [mySubs, fillable] = await Promise.all([listMySubmissions(), listFillableForms()])
  const [forms, queue, users] = await Promise.all([
    isManager ? listForms() : Promise.resolve([]),
    isManager ? listReviewQueue(user.id, { status: 'new' }) : Promise.resolve([]),
    profile.role === 'admin' ? listUsers() : Promise.resolve([]),
  ])

  const approved = mySubs.filter((s) => s.status === 'approved').length
  const needsAttention = mySubs.filter((s) => s.status === 'flagged' || s.status === 'rejected').length
  const deployedForms = forms.filter((f) => f.deployedCount > 0).length
  const firstName = (profile.full_name || user.email || '').split(' ')[0]

  const stats = isManager
    ? [
        { label: 'Forms', value: forms.length, icon: FileText, hint: `${deployedForms} deployed` },
        { label: 'Awaiting review', value: queue.length, icon: ClipboardList, hint: 'submissions to action' },
        { label: 'My submissions', value: mySubs.length, icon: Inbox },
        profile.role === 'admin'
          ? { label: 'Users', value: users.length, icon: UsersIcon }
          : { label: 'Forms to fill', value: fillable.length, icon: FileText },
      ]
    : [
        { label: 'Forms to fill', value: fillable.length, icon: FileText },
        { label: 'My submissions', value: mySubs.length, icon: Inbox },
        { label: 'Approved', value: approved, icon: CheckCircle2 },
        { label: 'Needs attention', value: needsAttention, icon: AlertTriangle },
      ]

  const actions = [
    { href: '/my-forms', label: 'Fill a form', show: true },
    { href: '/forms/new', label: 'New form', show: isManager, primary: true },
    { href: '/review', label: 'Review queue', show: isManager },
    { href: '/exports', label: 'Export data', show: isManager },
  ].filter((a) => a.show)

  const recent = mySubs.slice(0, 5)

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${firstName}`} description="Here's where things stand today.">
        {isManager ? (
          <Link href="/forms/new" className={buttonVariants()}>
            <Plus className="mr-1.5 h-4 w-4" /> New form
          </Link>
        ) : (
          <Link href="/my-forms" className={buttonVariants()}>
            Fill a form
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} hint={s.hint} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-medium">Recent submissions</h2>
            <Link href="/my-submissions" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No submissions yet. Open a form from{' '}
              <Link href="/my-forms" className="text-primary underline">
                My Forms
              </Link>{' '}
              to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.form_title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.submitted_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={s.status}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-medium">Quick actions</h2>
          <div className="space-y-2">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              >
                <span className={a.primary ? 'font-medium' : ''}>{a.label}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
