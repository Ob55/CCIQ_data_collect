import { cn } from '@/lib/utils'

/**
 * CleanCook wordmark. The asset is the light "dark-background" logo, so it must sit
 * on a dark (brand) surface to be legible. Served from /public by Vite.
 * @param {{ className?: string, width?: number, height?: number }} props
 */
export function BrandLogo({ className, width = 220, height = 66 }) {
  return (
    <img
      src="/cleancookiq-logo-dark.png"
      alt="CleanCook"
      width={width}
      height={height}
      className={cn('h-auto w-auto', className)}
    />
  )
}
