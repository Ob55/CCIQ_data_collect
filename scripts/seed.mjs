// Seed script — creates the four Phase-1 users (PRD §11). Uses the service-role key.
// Idempotent: existing users are left in place, only their profile role is reconciled.
// Run: npm run seed
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local', quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Shared dev password for all seeded accounts. Fine for local/staging, not production.
export const SEED_PASSWORD = 'CleanCook!2026'

export const SEED_USERS = [
  { email: 'admin@cleancook.test', full_name: 'CleanCook Admin', role: 'admin' },
  { email: 'supervisor@cleancook.test', full_name: 'Sam Supervisor', role: 'supervisor' },
  { email: 'enum1@cleancook.test', full_name: 'Ella Enumerator', role: 'enumerator' },
  { email: 'enum2@cleancook.test', full_name: 'Ben Enumerator', role: 'enumerator' },
]

async function findUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === email) ?? null
}

async function seed() {
  for (const u of SEED_USERS) {
    let user = await findUserByEmail(u.email)

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role },
      })
      if (error) throw error
      user = data.user
      console.log(`created ${u.role.padEnd(10)} ${u.email}`)
    } else {
      console.log(`exists  ${u.role.padEnd(10)} ${u.email}`)
    }

    // Reconcile the profile row (the trigger creates it; ensure role/name/active are correct).
    const { error: pErr } = await admin
      .from('profiles')
      .upsert(
        { id: user.id, email: u.email, full_name: u.full_name, role: u.role, active: true },
        { onConflict: 'id' }
      )
    if (pErr) throw pErr
  }

  console.log(`\nDone. All accounts share the password: ${SEED_PASSWORD}`)
}

// Only run when invoked directly, so tests can import SEED_USERS without seeding.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
