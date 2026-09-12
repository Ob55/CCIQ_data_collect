// RLS access tests (PRD §6.1, §11). Each test asserts a FORBIDDEN access is actually
// rejected by the database, not merely hidden by the UI.
//
// Prerequisites: migration applied + `npm run seed` run (the four seed users must exist).
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SEED_PASSWORD, SEED_USERS } from '../scripts/seed.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Sign in as a seed user with the anon key (RLS applies). */
async function signInAs(email) {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

const ids = {}
const fixtures = {
  formId: randomUUID(),
  deployedVersionId: randomUUID(),
  draftVersionId: randomUUID(),
  subEnum1: randomUUID(),
  subEnum2: randomUUID(),
  subSupervisor: randomUUID(),
  auditId: randomUUID(),
}

beforeAll(async () => {
  // Resolve seed user ids.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  for (const u of SEED_USERS) {
    const found = data.users.find((x) => x.email === u.email)
    if (!found) throw new Error(`Seed user ${u.email} missing — run "npm run seed" first.`)
    ids[u.email] = found.id
  }

  const supervisor = ids['supervisor@cleancook.test']
  const enum1 = ids['enum1@cleancook.test']
  const enum2 = ids['enum2@cleancook.test']

  // Build fixtures with the service role (bypasses RLS).
  await admin.from('forms').insert({
    id: fixtures.formId,
    title: 'RLS Test Form',
    slug: `rls-test-${fixtures.formId.slice(0, 8)}`,
    created_by: supervisor,
  })
  await admin.from('form_versions').insert([
    {
      id: fixtures.deployedVersionId,
      form_id: fixtures.formId,
      version_no: 1,
      schema: {},
      status: 'deployed',
    },
    {
      id: fixtures.draftVersionId,
      form_id: fixtures.formId,
      version_no: 2,
      schema: {},
      status: 'draft',
    },
  ])
  await admin.from('assignments').insert([
    { form_id: fixtures.formId, user_id: enum1, can_fill: true, can_review: false },
    { form_id: fixtures.formId, user_id: enum2, can_fill: true, can_review: false },
    { form_id: fixtures.formId, user_id: supervisor, can_fill: true, can_review: true },
  ])
  await admin.from('submissions').insert([
    {
      id: fixtures.subEnum1,
      form_version_id: fixtures.deployedVersionId,
      submitted_by: enum1,
      submitted_by_role: 'enumerator',
      data: { q1: 'a' },
    },
    {
      id: fixtures.subEnum2,
      form_version_id: fixtures.deployedVersionId,
      submitted_by: enum2,
      submitted_by_role: 'enumerator',
      data: { q1: 'b' },
    },
    {
      id: fixtures.subSupervisor,
      form_version_id: fixtures.deployedVersionId,
      submitted_by: supervisor,
      submitted_by_role: 'supervisor',
      data: { q1: 'c' },
    },
  ])
  await admin.from('audit_log').insert({
    id: fixtures.auditId,
    actor_id: supervisor,
    entity_type: 'form',
    entity_id: fixtures.formId,
    action: 'test.seed',
  })
})

afterAll(async () => {
  // Order matters: submissions/reviews reference versions with no cascade.
  await admin.from('reviews').delete().eq('submission_id', fixtures.subEnum1)
  await admin
    .from('submissions')
    .delete()
    .in('id', [fixtures.subEnum1, fixtures.subEnum2, fixtures.subSupervisor])
  await admin.from('audit_log').delete().eq('id', fixtures.auditId)
  await admin.from('forms').delete().eq('id', fixtures.formId) // cascades versions + assignments
})

describe('submissions isolation', () => {
  it('an enumerator sees their own submission', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { data } = await client.from('submissions').select('id')
    const seen = (data ?? []).map((r) => r.id)
    expect(seen).toContain(fixtures.subEnum1)
  })

  it('an enumerator CANNOT see another enumerator’s submission', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { data } = await client.from('submissions').select('id')
    const seen = (data ?? []).map((r) => r.id)
    expect(seen).not.toContain(fixtures.subEnum2)
    expect(seen).not.toContain(fixtures.subSupervisor)
  })
})

describe('form version visibility', () => {
  it('an enumerator can read a deployed version but NOT a draft version', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { data } = await client.from('form_versions').select('id, status')
    const seen = (data ?? []).map((r) => r.id)
    expect(seen).toContain(fixtures.deployedVersionId)
    expect(seen).not.toContain(fixtures.draftVersionId)
  })
})

describe('self-review block', () => {
  it('a supervisor CANNOT review their own submission', async () => {
    const client = await signInAs('supervisor@cleancook.test')
    const { error } = await client.from('reviews').insert({
      submission_id: fixtures.subSupervisor,
      reviewer_id: ids['supervisor@cleancook.test'],
      action: 'approve',
    })
    expect(error).not.toBeNull()
  })

  it('a supervisor CAN review an enumerator’s submission, and the trigger flips status', async () => {
    const client = await signInAs('supervisor@cleancook.test')
    const { error } = await client.from('reviews').insert({
      submission_id: fixtures.subEnum1,
      reviewer_id: ids['supervisor@cleancook.test'],
      action: 'approve',
    })
    expect(error).toBeNull()

    // The review trigger changes STATUS only; submission data is never mutated (§8).
    const { data } = await admin
      .from('submissions')
      .select('status, data')
      .eq('id', fixtures.subEnum1)
      .single()
    expect(data.status).toBe('approved')
    expect(data.data).toEqual({ q1: 'a' })
  })
})

describe('privilege boundaries', () => {
  it('a non-admin CANNOT read the audit log', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { data } = await client.from('audit_log').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('a supervisor CAN read all profiles (assignment roster, migration 0003)', async () => {
    const client = await signInAs('supervisor@cleancook.test')
    const { data } = await client.from('profiles').select('id')
    // Should see more than just their own row (all four seed users).
    expect((data ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('an enumerator still CANNOT read other profiles', async () => {
    const client = await signInAs('enum1@cleancook.test')
    const { data } = await client.from('profiles').select('id')
    expect((data ?? []).map((r) => r.id)).toEqual([ids['enum1@cleancook.test']])
  })

  it('a non-admin CANNOT change their own role', async () => {
    const client = await signInAs('enum1@cleancook.test')
    await client
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', ids['enum1@cleancook.test'])

    // Verify with the service role that the role did not change.
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('id', ids['enum1@cleancook.test'])
      .single()
    expect(data.role).toBe('enumerator')
  })
})
