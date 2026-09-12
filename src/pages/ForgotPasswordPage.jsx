import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { BrandLogo } from '@/components/brand-logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const emailSchema = z.string().trim().email()

// Supabase returns success regardless of whether the address exists, so this never reveals
// which emails are registered (§10). We show the same generic message either way.
const GENERIC = 'If that email is registered, a reset link is on its way. Check your inbox.'

export function ForgotPasswordPage() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const email = new FormData(e.currentTarget).get('email')
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setError('Enter a valid email address.')
      return
    }
    setPending(true)
    await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setMessage(GENERIC)
    setPending(false)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-brand p-6">
      <BrandLogo width={240} height={72} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
        </CardHeader>
        <CardContent>
          {message ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
              <p className="text-sm text-muted-foreground">{message}</p>
              <Link to="/login" className="inline-block text-sm text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Sending…' : 'Send reset link'}
              </Button>
              <Link
                to="/login"
                className="block text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
