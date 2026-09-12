import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'

/**
 * Left sidebar navigation. Role filtering happens in AppLayout; this component handles
 * active-link highlighting (via React Router), the mobile drawer, and sign-out.
 *
 * @param {{
 *   sections: { label: string, items: { href: string, label: string }[] }[],
 *   user: { name: string, email: string, roleLabel: string },
 *   onLogout: () => void,
 * }} props
 */
export function SidebarNav({ sections, user, onLogout }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1">
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-brand-foreground/50">
            {section.label}
          </div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-white/15 font-medium text-brand-foreground'
                  : 'text-brand-foreground/75 hover:bg-white/10 hover:text-brand-foreground'
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )

  const footer = (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 leading-tight">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-brand-foreground/60">{user.roleLabel}</div>
      </div>
      <Button variant="secondary" size="sm" type="button" className="w-full" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-brand text-brand-foreground md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-5 py-5">
          <BrandLogo width={150} height={45} />
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-brand-foreground md:hidden">
        <BrandLogo width={130} height={39} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-brand text-brand-foreground shadow-xl">
            <div className="flex items-center justify-between px-5 py-5">
              <BrandLogo width={150} height={45} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      ) : null}
    </>
  )
}
