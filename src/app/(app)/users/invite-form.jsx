'use client'

import { useActionState } from 'react'
import { inviteUserAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SELECT = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUserAction, null)

  return (
    <form action={action} className="space-y-4">
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
