import { BrandLogo } from '@/components/brand-logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ForgotForm } from './forgot-form'

export const metadata = { title: 'Reset password — CleanCook' }

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-brand p-6">
      <BrandLogo priority width={240} height={72} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotForm />
        </CardContent>
      </Card>
      <p className="text-xs text-brand-foreground/60">CleanCook Data Collection — internal use only</p>
    </main>
  )
}
