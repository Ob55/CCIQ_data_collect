import { cn } from '@/lib/utils'

/**
 * CleanCook wordmark. The asset is the light "dark-background" logo, so it must sit
 * on a dark (brand) surface to be legible. Served from /public by Vite.
 *
 * We size by width and let height scale (the logo is ~3.33:1), matching how next/image
 * rendered it before the migration. Do NOT add h-auto/w-auto here — as a plain <img> those
 * override the width attribute and blow the logo up to its intrinsic pixel size.
 * @param {{ className?: string, width?: number, height?: number }} props
 */
export function BrandLogo({ className, width = 220, height = 66 }) {
  return (
    <img
      src="/cleancookiq-logo-dark.png"
      alt="CleanCook"
      width={width}
      height={height}
      style={{ width, height: 'auto' }}
      className={cn(className)}
    />
  )
}
