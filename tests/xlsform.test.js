// Unit tests for the XLSForm parser (PRD §5, §11). Happy paths + every failure mode.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../src/lib/xlsform/parse.js'
import { XlsformError } from '../src/lib/xlsform/errors.js'
import { fixtures } from './fixtures/workbooks.js'

const parse = (name) => parseWorkbook(fixtures[name](), XLSX)

describe('simple form', () => {
  it('parses questions, choices and settings', () => {
    const { schema, warnings, questionCount } = parse('simple')
    expect(questionCount).toBe(4)
    expect(warnings).toHaveLength(0)
    expect(schema.settings.form_title).toBe('Simple Form')
    expect(schema.fields.map((f) => f.name)).toEqual(['full_name', 'age', 'owns_stove', 'thanks'])

    const stove = schema.fields.find((f) => f.name === 'owns_stove')
    expect(stove.type).toBe('select_one')
    expect(stove.list_name).toBe('yes_no')
    expect(stove.choices.map((c) => c.name)).toEqual(['yes', 'no'])

    const name = schema.fields.find((f) => f.name === 'full_name')
    expect(name.required).toBe(true)
  })
})

describe('groups and repeats', () => {
  it('nests a group and stores its skip-logic expression', () => {
    const { schema } = parse('groups')
    const group = schema.fields.find((f) => f.name === 'cooking')
    expect(group.type).toBe('begin_group')
    expect(group.relevant).toBe("selected(${cooks}, 'yes')")
    expect(group.children.map((c) => c.name)).toEqual(['meals', 'fuel'])
  })

  it('nests a repeat', () => {
    const { schema } = parse('repeat')
    const repeat = schema.fields.find((f) => f.name === 'members')
    expect(repeat.type).toBe('begin_repeat')
    expect(repeat.children.map((c) => c.name)).toEqual(['member_name', 'member_age'])
  })
})

describe('multi-language', () => {
  it('captures all languages and per-language labels', () => {
    const { schema } = parse('multilang')
    expect(schema.languages.sort()).toEqual(['English (en)', 'Kiswahili (sw)'])
    const name = schema.fields.find((f) => f.name === 'full_name')
    expect(name.label).toEqual({ 'English (en)': 'Name', 'Kiswahili (sw)': 'Jina' })
    const stove = schema.fields.find((f) => f.name === 'owns_stove')
    expect(stove.choices[0].label).toEqual({ 'English (en)': 'Yes', 'Kiswahili (sw)': 'Ndiyo' })
  })
})

describe('unsupported columns produce warnings, not errors', () => {
  it('warns once per unknown column', () => {
    const wb = fixtures.simple()
    // Inject an unsupported column into the survey sheet.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.survey, { header: 1 })
    rows[0].push('media::image')
    wb.Sheets.survey = XLSX.utils.aoa_to_sheet(rows)
    const { warnings } = parseWorkbook(wb, XLSX)
    expect(warnings.some((w) => w.includes('media::image'))).toBe(true)
  })
})

describe('broken workbooks fail loudly with row + detail', () => {
  it('rejects an unsupported type, naming the row and type', () => {
    try {
      parse('brokenType')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XlsformError)
      expect(err.row).toBe(3)
      expect(err.message).toContain('barcode')
    }
  })

  it('rejects an invalid expression, naming the row and expression', () => {
    try {
      parse('brokenExpr')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XlsformError)
      expect(err.row).toBe(3)
      expect(err.value).toBe('${age} >')
      expect(err.message).toContain('relevant')
    }
  })

  it('rejects an unclosed group', () => {
    expect(() => parse('brokenUnclosed')).toThrow(XlsformError)
  })

  it('rejects a select referencing a missing choice list', () => {
    try {
      parse('brokenMissingList')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XlsformError)
      expect(err.message).toContain('nonexistent')
    }
  })

  it('rejects a workbook with no survey sheet', () => {
    expect(() => parse('brokenNoSurvey')).toThrow(/survey/i)
  })
})
