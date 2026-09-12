// Unit tests for the MCP schema helpers (Phase 8). Pure — no DB.
import { describe, it, expect } from 'vitest'
import { labelFor, flattenSchema, renderSubmission, collectImagePaths } from '../src/lib/schema.js'

// A schema exercising: multilang labels, select_one, select_multiple, a group, a repeat,
// and an image field.
const schema = {
  languages: ['en', 'sw'],
  fields: [
    { type: 'text', name: 'household_id', label: { en: 'Household ID', sw: 'Kitambulisho' } },
    {
      type: 'select_one',
      name: 'fuel',
      label: { en: 'Main fuel' },
      choices: [
        { name: 'lpg', label: { en: 'LPG', sw: 'Gesi' } },
        { name: 'wood', label: { en: 'Firewood' } },
      ],
    },
    {
      type: 'select_multiple',
      name: 'stoves',
      label: { en: 'Stoves owned' },
      choices: [
        { name: 'clean', label: { en: 'Clean stove' } },
        { name: 'three_stone', label: { en: 'Three-stone fire' } },
      ],
    },
    {
      type: 'begin_group',
      name: 'location_grp',
      label: { en: 'Location' },
      children: [{ type: 'text', name: 'village', label: { en: 'Village' } }],
    },
    {
      type: 'begin_repeat',
      name: 'members',
      label: { en: 'Household members' },
      children: [
        { type: 'text', name: 'member_name', label: { en: 'Name' } },
        { type: 'integer', name: 'member_age', label: { en: 'Age' } },
        { type: 'image', name: 'member_photo', label: { en: 'Photo' } },
      ],
    },
  ],
}

describe('labelFor', () => {
  it('prefers the active language', () => {
    expect(labelFor(schema.fields[0], 'sw')).toBe('Kitambulisho')
  })
  it('falls back to the first available language, then the name', () => {
    expect(labelFor(schema.fields[1], 'sw')).toBe('Main fuel')
    expect(labelFor({ name: 'raw' }, 'en')).toBe('raw')
  })
})

describe('flattenSchema', () => {
  it('flattens groups into main and pulls repeats out, with choice options on selects', () => {
    const { main, repeats } = flattenSchema(schema, 'en')
    expect(main.map((c) => c.name)).toEqual(['household_id', 'fuel', 'stoves', 'village'])

    const fuel = main.find((c) => c.name === 'fuel')
    expect(fuel.choices).toEqual([
      { value: 'lpg', label: 'LPG' },
      { value: 'wood', label: 'Firewood' },
    ])

    expect(repeats).toHaveLength(1)
    expect(repeats[0].name).toBe('members')
    expect(repeats[0].columns.map((c) => c.name)).toEqual([
      'member_name',
      'member_age',
      'member_photo',
    ])
  })
})

describe('renderSubmission', () => {
  const data = {
    household_id: 'HH-001',
    fuel: 'lpg',
    stoves: 'clean three_stone', // ODK space-delimited select_multiple
    village: 'Kianjai',
    members: [
      { member_name: 'Amina', member_age: 34, member_photo: { storage_path: 'sub/photo1.jpg' } },
      { member_name: 'Juma', member_age: 8 },
    ],
  }

  it('renders labels, maps choice values, and expands repeats as arrays', () => {
    const out = renderSubmission(schema, data, 'en', { 'sub/photo1.jpg': 'https://signed/photo1' })

    expect(out['Household ID']).toBe('HH-001')
    expect(out['Main fuel']).toBe('LPG')
    expect(out['Stoves owned']).toBe('Clean stove, Three-stone fire')
    expect(out['Village']).toBe('Kianjai') // group flattened inline

    expect(Array.isArray(out['Household members'])).toBe(true)
    expect(out['Household members']).toHaveLength(2)
    expect(out['Household members'][0]).toEqual({
      Name: 'Amina',
      Age: 34,
      Photo: 'https://signed/photo1', // image path replaced with signed URL
    })
    expect(out['Household members'][1].Photo).toBe('') // no photo -> empty
  })

  it('uses the requested language for labels and choices', () => {
    const out = renderSubmission(schema, { fuel: 'lpg' }, 'sw', {})
    expect(out['Main fuel']).toBe('Gesi')
  })
})

describe('collectImagePaths', () => {
  it('finds image paths in top-level and repeat data', () => {
    const set = new Set()
    collectImagePaths(
      { a: { storage_path: 'x.jpg' }, members: [{ member_photo: { storage_path: 'y.jpg' } }] },
      set
    )
    expect([...set].sort()).toEqual(['x.jpg', 'y.jpg'])
  })
})
