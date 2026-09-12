import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { loginSchema } from '@/lib/schemas'
import { BrandLogo } from '@/components/brand-logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { session } = useAuth()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const next = params.get('next') || '/dashboard'
  const safeNext = next.startsWith('/') ? next : '/dashboard'

  // Already signed in → skip the form.
  useEffect(() => {
    if (session) navigate(safeNext, { replace: true })
  }, [session, safeNext, navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input.')
      return
    }
    setPending(true)
    const { error: err } = await supabase.auth.signInWithPassword(parsed.data)
    if (err) {
      setError('Incorrect email or password.')
      setPending(false)
      return
    }
    navigate(safeNext, { replace: true })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-brand p-6">
      <BrandLogo width={240} height={72} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput id="password" name="password" autoComplete="current-password" required />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-xs text-brand-foreground/60">CleanCook Data Collection — internal use only</p>
    </main>
  )
}
