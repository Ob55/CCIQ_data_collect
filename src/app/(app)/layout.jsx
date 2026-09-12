import { requireUser } from '@/lib/auth'
import { SidebarNav } from './sidebar-nav'
import { logout } from './actions'

const ROLE_LABEL = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  enumerator: 'Enumerator',
}

/** Nav grouped into role-aware sections (PRD §7). Each item lists the roles allowed to see it. */
const ALL = ['admin', 'supervisor', 'enumerator']
const SECTIONS = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', roles: ALL }],
  },
  {
    label: 'Collect',
    items: [
      { href: '/my-forms', label: 'My Forms', roles: ALL },
      { href: '/my-submissions', label: 'Submissions', roles: ALL },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/forms', label: 'Forms', roles: ['admin', 'supervisor'] },
      { href: '/review', label: 'Review', roles: ['admin', 'supervisor'] },
      { href: '/exports', label: 'Exports', roles: ['admin', 'supervisor'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/users', label: 'Users', roles: ['admin'] },
      { href: '/audit', label: 'Audit', roles: ['admin'] },
    ],
  },
]

export default async function AppLayout({ children }) {
  const { user, profile } = await requireUser()

  // Filter items by role, then drop any section left empty for this role.
  const sections = SECTIONS.map((s) => ({
    label: s.label,
    items: s.items.filter((i) => i.roles.includes(profile.role)),
  })).filter((s) => s.items.length > 0)

  return (
    <div className="min-h-screen bg-background md:flex">
      <SidebarNav
        sections={sections}
        user={{
          name: profile.full_name || user.email,
          email: user.email,
          roleLabel: ROLE_LABEL[profile.role],
        }}
        logout={logout}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  )
}
