import { cn } from '@/lib/utils'
import { Card } from './card'

/**
 * A single headline metric.
 * @param {{ label: string, value: React.ReactNode, icon?: React.ComponentType<any>, hint?: string, className?: string }} props
 */
export function StatCard({ label, value, icon: Icon, hint, className }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  )
}
