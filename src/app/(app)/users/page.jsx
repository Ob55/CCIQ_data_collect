import { requireRole } from '@/lib/auth'
import { listUsers } from '@/lib/users'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/ui/stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteForm } from './invite-form'
import { UserRow } from './user-row'

export const metadata = { title: 'Users — CleanCook' }

export default async function UsersPage() {
  const { user } = await requireRole(['admin'])
  const users = await listUsers()
  const byRole = (role) => users.filter((u) => u.role === role).length

  return (
    <div className="space-y-8">
      <PageHeader title="Users" description="Invite people, set roles, and deactivate accounts." />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={users.length} />
        <StatCard label="Admins" value={byRole('admin')} />
        <StatCard label="Supervisors" value={byRole('supervisor')} />
        <StatCard label="Enumerators" value={byRole('enumerator')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">User</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <UserRow key={u.id} user={u} isSelf={u.id === user.id} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
