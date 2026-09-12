// Unit tests for the from-scratch form builder (§5.5). Pure — no DB. Asserts the produced
// schema validates and matches what the runtime renderer/exporter expect.
import { describe, it, expect } from 'vitest'
import { buildRuntimeSchema, toName } from '../src/lib/xlsform/builder.js'
import { formSchema } from '../src/lib/xlsform/schema.js'

describe('toName', () => {
  it('slugifies labels to safe snake_case', () => {
    expect(toName('What is your name?', new Set(), 'q1')).toBe('what_is_your_name')
  })
  it('dedupes collisions', () => {
    const seen = new Set()
    expect(toName('Age', seen, 'q1')).toBe('age')
    expect(toName('Age', seen, 'q2')).toBe('age_2')
  })
  it('falls back when the label has no usable characters', () => {
    expect(toName('???', new Set(), 'q3')).toBe('q3')
  })
  it('prefixes names that would start with a digit', () => {
    expect(toName('123 go', new Set(), 'q1')).toBe('q1_123_go')
  })
})

describe('buildRuntimeSchema', () => {
  it('builds a valid schema from mixed field types', () => {
    const schema = buildRuntimeSchema({
      title: 'Cookstove Survey',
      fields: [
        { type: 'text', label: 'Household name', required: true },
        { type: 'integer', label: 'People in household' },
        {
          type: 'select_one',
          label: 'Owns a stove?',
          choices: [{ label: 'Yes' }, { label: 'No' }],
        },
      ],
    })

    // Validates against the same schema the XLSForm parser emits.
    expect(() => formSchema.parse(schema)).not.toThrow()
    expect(schema.settings.form_title).toBe('Cookstove Survey')
    expect(schema.languages).toEqual(['default'])
    expect(schema.fields).toHaveLength(3)

    const [name, count, stove] = schema.fields
    expect(name).toMatchObject({ type: 'text', name: 'household_name', required: true })
    expect(name.label).toEqual({ default: 'Household name' })
    expect(count.required).toBe(false)
    expect(stove.type).toBe('select_one')
    expect(stove.list_name).toBe('owns_a_stove_choices')
    expect(stove.choices.map((c) => c.name)).toEqual(['yes', 'no'])
    expect(stove.choices[0].label).toEqual({ default: 'Yes' })
  })

  it('respects an explicit data-column name and attaches hints', () => {
    const schema = buildRuntimeSchema({
      title: 'T',
      fields: [{ type: 'decimal', label: 'Monthly spend', name: 'spend_kes', hint: 'In KES' }],
    })
    expect(schema.fields[0].name).toBe('spend_kes')
    expect(schema.fields[0].hint).toEqual({ default: 'In KES' })
  })

  it('generates unique names for duplicate labels', () => {
    const schema = buildRuntimeSchema({
      title: 'T',
      fields: [
        { type: 'text', label: 'Note' },
        { type: 'text', label: 'Note' },
      ],
    })
    expect(schema.fields.map((f) => f.name)).toEqual(['note', 'note_2'])
  })
})
