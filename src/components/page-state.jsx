import { Card } from '@/components/ui/card'

/** Shared loading / error states for pages that fetch on mount. */
export function Loading({ label = 'Loading…' }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{label}</div>
}

export function ErrorState({ message }) {
  return (
    <Card className="p-8 text-center text-sm text-destructive">
      {message || 'Something went wrong.'}
    </Card>
  )
}
