// Create (or update) a single user with a password + role. Service-role.
// Idempotent: an existing account keeps its id; password, role, name and confirmation are reconciled.
//
// Run: node scripts/create-user.mjs <email> <password> [role] ["Full Name"]
//   role defaults to "admin". Example:
//   node scripts/create-user.mjs brian55mwangi@gmail.com Draggonne admin "Brian Mwangi"
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local', quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const [, , email, password, role = 'admin', full_name = ''] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> <password> [role] ["Full Name"]')
  process.exit(1)
}
if (!['admin', 'supervisor', 'enumerator'].includes(role)) {
  console.error(`Invalid role "${role}". Use admin | supervisor | enumerator.`)
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(target) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === target) ?? null
}

async function run() {
  let user = await findUserByEmail(email)

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })
    if (error) throw error
    user = data.user
    console.log(`created ${role.padEnd(10)} ${email}`)
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })
    if (error) throw error
    console.log(`updated ${role.padEnd(10)} ${email} (password reset)`)
  }

  const { error: pErr } = await admin
    .from('profiles')
    .upsert({ id: user.id, email, full_name, role, active: true }, { onConflict: 'id' })
  if (pErr) throw pErr

  console.log(`Done. ${email} can sign in with the given password as ${role}.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
