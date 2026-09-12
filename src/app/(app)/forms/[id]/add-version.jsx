'use client'

import { useActionState } from 'react'
import { addVersionAction } from '../actions'
import { Button } from '@/components/ui/button'

/** Upload a new draft version of an existing form (§5.5). */
export function AddVersion({ formId }) {
  const [state, action, pending] = useActionState(addVersionAction, null)

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="form_id" value={formId} />
      <input
        type="file"
        name="file"
        accept=".xlsx"
        required
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload new version'}
      </Button>
      {state && !state.ok ? (
        <span role="alert" className="text-sm text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
