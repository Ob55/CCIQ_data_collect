'use client'

import { setRoleAction, setActiveAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// One user row with inline role change + activate/deactivate. `isSelf` disables self-deactivation.
export function UserRow({ user, isSelf }) {
  return (
    <tr className={user.active ? '' : 'opacity-50'}>
      <td className="px-4 py-2">
        <div className="font-medium">{user.full_name || '—'}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-4 py-2">
        <form action={setRoleAction} className="inline">
          <input type="hidden" name="user_id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            onChange={(e) => e.target.form.requestSubmit()}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            disabled={isSelf}
          >
            <option value="enumerator">Enumerator</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </form>
      </td>
      <td className="px-4 py-2">
        <Badge variant={user.active ? 'deployed' : 'retired'}>
          {user.active ? 'active' : 'inactive'}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right">
        <form action={setActiveAction} className="inline">
          <input type="hidden" name="user_id" value={user.id} />
          <input type="hidden" name="active" value={(!user.active).toString()} />
          <Button type="submit" size="sm" variant="outline" disabled={isSelf && user.active}>
            {user.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </form>
      </td>
    </tr>
  )
}
