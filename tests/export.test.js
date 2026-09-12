// Unit tests for export shaping (PRD §9): flattening, cross-version merge, repeat sheets,
// header modes. Pure — no DB.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../src/lib/xlsform/parse.js'
import { fixtures } from './fixtures/workbooks.js'
import { flattenSchema, mergeSchemas, buildSheets } from '../src/lib/export-build.js'

const schemaOf = (name) => parseWorkbook(fixtures[name](), XLSX).schema

describe('flattenSchema', () => {
  it('flattens groups into the main sheet', () => {
    const { main, repeats } = flattenSchema(schemaOf('groups'), 'default')
    expect(main.map((c) => c.name)).toEqual(['cooks', 'meals', 'fuel'])
    expect(repeats).toHaveLength(0)
  })

  it('pulls repeats out as their own column set', () => {
    const { main, repeats } = flattenSchema(schemaOf('repeat'), 'default')
    expect(main.map((c) => c.name)).toEqual(['household_id'])
    expect(repeats).toHaveLength(1)
    expect(repeats[0].name).toBe('members')
    expect(repeats[0].columns.map((c) => c.name)).toEqual(['member_name', 'member_age'])
  })
})

describe('buildSheets', () => {
  const merged = mergeSchemas([{ schema: schemaOf('repeat') }], 'English (en)')
  const submissions = [
    {
      id: 's1',
      enumerator: 'Ella',
      role: 'enumerator',
      submitted_at: '2026-01-01T00:00:00Z',
      duration: 42,
      status: 'new',
      comment: '',
      version_no: 1,
      data: { household_id: 'H1', members: [{ member_name: 'A', member_age: 1 }, { member_name: 'B', member_age: 2 }] },
    },
    {
      id: 's2',
      enumerator: 'Ben',
      role: 'enumerator',
      submitted_at: '2026-01-02T00:00:00Z',
      duration: 99,
      status: 'approved',
      comment: 'ok',
      version_no: 1,
      data: { household_id: 'H2', members: [] },
    },
  ]

  it('main sheet has one row per submission with metadata + question columns', () => {
    const { main } = buildSheets({ merged, submissions, headerMode: 'names', imageUrlMap: {} })
    expect(main[0]).toContain('Submission ID')
    expect(main[0]).toContain('household_id') // variable-name header
    expect(main).toHaveLength(3) // header + 2 rows
    expect(main[1][0]).toBe('s1')
    expect(main[1].at(-1)).toBe('H1')
  })

  it('repeat sheet is long-format, one row per instance, joined by submission id', () => {
    const { repeats } = buildSheets({ merged, submissions, headerMode: 'labels', imageUrlMap: {} })
    expect(repeats).toHaveLength(1)
    const sheet = repeats[0].aoa
    expect(sheet[0][0]).toBe('Submission ID')
    expect(sheet[0]).toContain('Member name') // label header
    // s1 has 2 instances, s2 has 0 => 2 data rows + header
    expect(sheet).toHaveLength(3)
    expect(sheet[1][0]).toBe('s1')
    expect(sheet[2][0]).toBe('s1')
  })

  it('label header mode uses question labels', () => {
    const { main } = buildSheets({ merged, submissions, headerMode: 'labels', imageUrlMap: {} })
    expect(main[0]).toContain('Household ID')
  })
})
