import { requireRole } from '@/lib/auth'
import { listAudit } from '@/lib/audit'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const metadata = { title: 'Audit log — CleanCook' }

const SELECT = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

export default async function AuditPage({ searchParams }) {
  await requireRole(['admin'])
  const sp = await searchParams
  const filters = {
    action: sp.action || '',
    entityType: sp.entityType || '',
    from: sp.from || '',
    to: sp.to || '',
  }
  const rows = await listAudit(filters)

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Read-only record of every significant action." />

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Action
          <Input name="action" defaultValue={filters.action} placeholder="e.g. review" className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Entity
          <select name="entityType" defaultValue={filters.entityType} className={SELECT}>
            <option value="">Any</option>
            <option value="form">Form</option>
            <option value="form_version">Form version</option>
            <option value="submission">Submission</option>
            <option value="user">User</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={filters.from} className={SELECT} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={filters.to} className={SELECT} />
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No audit entries match.</Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">When</th>
                  <th className="px-4 py-2 text-left font-medium">Actor</th>
                  <th className="px-4 py-2 text-left font-medium">Action</th>
                  <th className="px-4 py-2 text-left font-medium">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{r.actor_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.entity_type}
                      {r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
