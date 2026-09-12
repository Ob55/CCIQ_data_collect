'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// Error boundary for the authenticated app (PRD §7 polish).
export default function AppError({ error, reset }) {
  useEffect(() => {
    // In production this would go to an error tracker; keep it out of the user's face.
    console.error(error)
  }, [error])

  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="space-y-4 py-10 text-center">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          The page hit an unexpected error. You can try again.
        </p>
        <Button onClick={() => reset()}>Try again</Button>
      </CardContent>
    </Card>
  )
}
