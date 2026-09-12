import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * CleanCook wordmark. The asset is the light "dark-background" logo, so it must sit
 * on a dark (brand) surface to be legible.
 * @param {{ className?: string, width?: number, height?: number, priority?: boolean }} props
 */
export function BrandLogo({ className, width = 220, height = 66, priority = false }) {
  return (
    <Image
      src="/cleancookiq-logo-dark.png"
      alt="CleanCook"
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto w-auto', className)}
    />
  )
}
