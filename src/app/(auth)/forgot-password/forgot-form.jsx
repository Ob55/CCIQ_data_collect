'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { requestPasswordReset } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {})

  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link href="/login" className="inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <Link
        href="/login"
        className="block text-center text-xs text-muted-foreground hover:text-foreground"
      >
        Back to sign in
      </Link>
    </form>
  )
}
