import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { listUsers, inviteUser, setUserRole, setUserActive } from '@/lib/users'
import { inviteUserSchema } from '@/lib/schemas'
import { useAsync } from '@/lib/use-async'
import { Loading, ErrorState } from '@/components/page-state'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/ui/stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

// User administration (§7 screen 6). Admin-only (route guard + RLS). Server actions from the
// Next.js version are replaced with direct lib calls + local pending/error state, and a reload
// after each mutation (the SPA equivalent of revalidatePath).
export function UsersPage() {
  const { user } = useAuth()
  const { data: users, loading, error, reload } = useAsync(() => listUsers(), [])

  return (
    <div className="space-y-8">
      <PageHeader title="Users" description="Invite people, set roles, and deactivate accounts." />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <UsersContent users={users} selfId={user.id} reload={reload} />
      )}
    </div>
  )
}

function UsersContent({ users, selfId, reload }) {
  const byRole = (role) => users.filter((u) => u.role === role).length

  return (
    <>
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
          <InviteForm onInvited={reload} />
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
                  <UserRow key={u.id} user={u} isSelf={u.id === selfId} reload={reload} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

const SELECT = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

function InviteForm({ onInvited }) {
  const [pending, setPending] = useState(false)
  const [state, setState] = useState(null) // { ok, actionLink } | { ok: false, error }

  async function handleSubmit(e) {
    e.preventDefault()
    setState(null)
    const fd = new FormData(e.currentTarget)
    const parsed = inviteUserSchema.safeParse({
      email: fd.get('email'),
      full_name: fd.get('full_name'),
      role: fd.get('role'),
    })
    if (!parsed.success) {
      setState({ ok: false, error: parsed.error.issues[0]?.message || 'Invalid input.' })
      return
    }

    setPending(true)
    try {
      const { actionLink, emailed } = await inviteUser({
        ...parsed.data,
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      setState({ ok: true, actionLink: emailed ? null : actionLink })
      e.target.reset()
      onInvited?.()
    } catch (err) {
      setState({ ok: false, error: err?.message || 'Something went wrong.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="full_name">Name</Label>
          <Input id="full_name" name="full_name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <select id="role" name="role" className={SELECT} defaultValue="enumerator">
            <option value="enumerator">Enumerator</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Inviting…' : 'Invite user'}
      </Button>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {state?.ok ? (
        <div className="space-y-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <p>Invite created. Send this link to the user:</p>
          {state.actionLink ? (
            <input
              readOnly
              value={state.actionLink}
              onFocus={(e) => e.target.select()}
              className="w-full rounded border bg-white px-2 py-1 font-mono text-xs text-foreground"
            />
          ) : (
            <p>An invite email was sent (SMTP configured).</p>
          )}
        </div>
      ) : null}
    </form>
  )
}

// One user row with inline role change + activate/deactivate. `isSelf` disables self-deactivation
// and self role changes (matching the original).
function UserRow({ user, isSelf, reload }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function changeRole(role) {
    if (role === user.role) return
    setPending(true)
    setError('')
    try {
      await setUserRole({ userId: user.id, role })
      reload?.()
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
      setPending(false)
    }
  }

  async function toggleActive() {
    setPending(true)
    setError('')
    try {
      await setUserActive({ userId: user.id, active: !user.active })
      reload?.()
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
      setPending(false)
    }
  }

  return (
    <tr className={user.active ? '' : 'opacity-50'}>
      <td className="px-4 py-2">
        <div className="font-medium">{user.full_name || '—'}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
        {error ? (
          <div role="alert" className="text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2">
        <select
          defaultValue={user.role}
          onChange={(e) => changeRole(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          disabled={isSelf || pending}
        >
          <option value="enumerator">Enumerator</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <Badge variant={user.active ? 'deployed' : 'retired'}>
          {user.active ? 'active' : 'inactive'}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={toggleActive}
          disabled={pending || (isSelf && user.active)}
        >
          {user.active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </td>
    </tr>
  )
}
