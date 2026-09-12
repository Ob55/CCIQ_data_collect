// One-off helper: link the Supabase project and apply migrations via the CLI,
// authenticating with the personal access token. Secrets come from .env.local and are
// never printed. Run: node scripts/db-apply.mjs push
import { execFileSync } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const REF = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\./)?.[1]
const PWD = process.env.SUPABASE_DB_PASSWORD
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!REF || !PWD || !TOKEN) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD and SUPABASE_ACCESS_TOKEN.')
  process.exit(1)
}

// Token passed via env so it never appears on a command line.
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN }

function sb(args, opts = {}) {
  return execFileSync('supabase', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    env,
    ...opts,
  })
}

try {
  console.log('linking project…')
  sb(['link', '--project-ref', REF, '--password', PWD])
  console.log('applying migrations…')
  const out = sb(['db', 'push', '--yes'])
  console.log(out)
  console.log('✅ migrations applied')
} catch (err) {
  const msg = String(err.stdout || '') + String(err.stderr || '') + String(err.message || '')
  console.error(msg.slice(0, 2000))
  process.exit(2)
}
