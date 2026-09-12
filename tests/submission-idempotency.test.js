// Submission idempotency + insert-authorization (PRD §6, §10). A double-tapped submit or a
// retry must never create two rows; only an assigned can_fill user may insert.
//
// Prereqs: migration 0001 applied + `npm run seed`.
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SEED_PASSWORD, SEED_USERS } from '../scripts/seed.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

async function signInAs(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

const ids = {}
const ctx = { formId: null, versionId: null }
const slug = `subtest-${randomUUID().slice(0, 8)}`

beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of SEED_USERS) ids[u.email] = data.users.find((x) => x.email === u.email)?.id

  const { data: form } = await admin
    .from('forms')
    .insert({ title: 'Idempotency Form', slug, created_by: ids['supervisor@cleancook.test'] })
    .select('id')
    .single()
  ctx.formId = form.id

  const { data: version } = await admin
    .from('form_versions')
    .insert({ form_id: form.id, version_no: 1, schema: {}, status: 'deployed' })
    .select('id')
    .single()
  ctx.versionId = version.id

  // Only enum1 can fill.
  await admin
    .from('assignments')
    .insert({ form_id: form.id, user_id: ids['enum1@cleancook.test'], can_fill: true })
})

afterAll(async () => {
  if (ctx.formId) {
    await admin.from('submissions').delete().eq('form_version_id', ctx.versionId)
    await admin.from('forms').delete().eq('id', ctx.formId)
  }
})

describe('submission idempotency', () => {
  it('inserting the same submission id twice creates exactly one row', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const id = randomUUID()
    const row = {
      id,
      form_version_id: ctx.versionId,
      submitted_by: ids['enum1@cleancook.test'],
      submitted_by_role: 'enumerator',
      data: { q1: 'a' },
    }

    const first = await client.from('submissions').insert(row)
    expect(first.error).toBeNull()

    const second = await client.from('submissions').insert(row)
    expect(second.error).not.toBeNull()
    expect(second.error.code).toBe('23505') // unique_violation => idempotent no-op

    const { count } = await admin
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })
})

describe('insert authorization', () => {
  it('an unassigned user cannot insert a submission (RLS)', async () => {
    const client = await signInAs('enum2@cleancook.test')
    const { error } = await client.from('submissions').insert({
      id: randomUUID(),
      form_version_id: ctx.versionId,
      submitted_by: ids['enum2@cleancook.test'],
      submitted_by_role: 'enumerator',
      data: {},
    })
    expect(error).not.toBeNull() // no can_fill assignment => denied
  })

  it('a user cannot spoof submitted_by_role', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { error } = await client.from('submissions').insert({
      id: randomUUID(),
      form_version_id: ctx.versionId,
      submitted_by: ids['enum1@cleancook.test'],
      submitted_by_role: 'admin', // lie about role
      data: {},
    })
    expect(error).not.toBeNull() // check enforces submitted_by_role = current_user_role()
  })
})
