'use client'

import { useState, useActionState } from 'react'
import { setAssignmentsAction } from '../actions'
import { Button } from '@/components/ui/button'

const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', enumerator: 'Enumerator' }

/**
 * Assignment editor (§7): per-user can_fill / can_review toggles.
 * @param {{ formId: string, users: Array<{id,full_name,email,role}>, current: Array<{user_id,can_fill,can_review}> }} props
 */
export function Assignments({ formId, users, current }) {
  const initial = {}
  for (const u of users) {
    const a = current.find((c) => c.user_id === u.id)
    initial[u.id] = { can_fill: a?.can_fill ?? false, can_review: a?.can_review ?? false }
  }
  const [rows, setRows] = useState(initial)
  const [state, action, pending] = useActionState(setAssignmentsAction, null)

  function toggle(userId, key) {
    setRows((r) => ({ ...r, [userId]: { ...r[userId], [key]: !r[userId][key] } }))
  }

  const entries = users.map((u) => ({ user_id: u.id, ...rows[u.id] }))

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="form_id" value={formId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-center font-medium">Can fill</th>
              <th className="px-4 py-2 text-center font-medium">Can review</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</div>
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={rows[u.id].can_fill}
                    onChange={() => toggle(u.id, 'can_fill')}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={rows[u.id].can_review}
                    // Enumerators never review (§3); keep the box disabled for them.
                    disabled={u.role === 'enumerator'}
                    onChange={() => toggle(u.id, 'can_review')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save assignments'}
        </Button>
        {state?.ok ? <span className="text-sm text-green-700">Saved.</span> : null}
        {state && !state.ok ? (
          <span role="alert" className="text-sm text-destructive">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  )
}
