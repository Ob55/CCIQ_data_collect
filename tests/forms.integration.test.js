// Phase 3 integration test: exercises the form lifecycle the forms service performs —
// create form + draft version, store the source workbook, deploy, assign an enumerator —
// then verifies via an anon (RLS) session that the enumerator can now see the deployed
// version. Also doubles as a check that migration 0002 (storage bucket) is applied.
//
// Prereqs: migrations 0001 + 0002 applied, `npm run seed` run.
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { parseWorkbook } from '../src/lib/xlsform/parse.js'
import { fixtures } from './fixtures/workbooks.js'
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
const slug = `int-${randomUUID().slice(0, 8)}`
const sourcePath = () => `${ids.formId}/v1.xlsx`

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  for (const u of SEED_USERS) {
    const found = data.users.find((x) => x.email === u.email)
    if (!found) throw new Error(`Seed user ${u.email} missing — run "npm run seed" first.`)
    ids[u.email] = found.id
  }
})

afterAll(async () => {
  if (ids.formId) {
    await admin.storage.from('xlsform-sources').remove([sourcePath()])
    await admin.from('forms').delete().eq('id', ids.formId) // cascades versions + assignments
  }
})

describe('form lifecycle', () => {
  it('create → store source → deploy → assign, then enumerator sees the deployed version', async () => {
    const supervisor = ids['supervisor@cleancook.test']
    const enum1 = ids['enum1@cleancook.test']

    // 1. Create the form.
    const { data: form, error: formErr } = await admin
      .from('forms')
      .insert({ title: 'Integration Form', slug, created_by: supervisor })
      .select('id')
      .single()
    expect(formErr).toBeNull()
    ids.formId = form.id

    // 2. Parse the fixture and insert the draft version.
    const { schema, questionCount } = parseWorkbook(fixtures.simple(), XLSX)
    expect(questionCount).toBe(4)
    const { data: version, error: verErr } = await admin
      .from('form_versions')
      .insert({ form_id: form.id, version_no: 1, schema, status: 'draft' })
      .select('id')
      .single()
    expect(verErr).toBeNull()

    // 3. Store the source workbook (verifies the private bucket from migration 0002).
    const buf = XLSX.write(fixtures.simple(), { type: 'buffer', bookType: 'xlsx' })
    const { error: upErr } = await admin.storage
      .from('xlsform-sources')
      .upload(sourcePath(), buf, { upsert: true })
    expect(upErr, 'storage upload failed — is migration 0002 applied?').toBeNull()

    // 4. Deploy the version.
    const { error: depErr } = await admin
      .from('form_versions')
      .update({ status: 'deployed', deployed_at: new Date().toISOString(), deployed_by: supervisor })
      .eq('id', version.id)
    expect(depErr).toBeNull()

    // 5. Assign enum1 with can_fill.
    const { error: asgErr } = await admin
      .from('assignments')
      .insert({ form_id: form.id, user_id: enum1, can_fill: true, can_review: false })
    expect(asgErr).toBeNull()

    // 6. As enum1 (RLS), the deployed version is now visible.
    const client = await signInAs('enum1@cleancook.test')
    const { data: visible } = await client.from('form_versions').select('id, status').eq('id', version.id)
    expect((visible ?? []).map((v) => v.id)).toContain(version.id)

    // ...and the form row is visible to the assigned enumerator.
    const { data: visForm } = await client.from('forms').select('id').eq('id', form.id)
    expect((visForm ?? []).map((f) => f.id)).toContain(form.id)
  })
})
