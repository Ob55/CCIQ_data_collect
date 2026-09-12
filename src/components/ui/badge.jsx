import { cn } from '@/lib/utils'

const VARIANTS = {
  draft: 'bg-muted text-muted-foreground',
  deployed: 'bg-green-100 text-green-800',
  retired: 'bg-amber-100 text-amber-800',
  new: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  flagged: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  default: 'bg-secondary text-secondary-foreground',
}

/** @param {{ variant?: keyof typeof VARIANTS, className?: string, children: any }} props */
export function Badge({ variant = 'default', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        VARIANTS[variant] ?? VARIANTS.default,
        className
      )}
    >
      {children}
    </span>
  )
}
