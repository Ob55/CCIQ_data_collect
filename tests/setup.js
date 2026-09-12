// Load .env.local for tests (Supabase URL + keys) before any test runs.
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
