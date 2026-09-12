// @ts-check
// XLSForm workbook -> validated JSON form schema (PRD §5). Fails LOUDLY at upload time on
// unsupported types or invalid expressions, naming the row — never silently skips a question.
// `xlsx` (the heavy SheetJS CDN tarball) is NOT imported statically — that would pull it into
// every route that transitively imports form logic. `parseXlsform` dynamically imports it and
// injects it into `parseWorkbook`, so it only loads on the server paths that actually parse a file.
import { XlsformError } from './errors.js'
import { parseExpression } from './expression.js'
import {
  SURVEY_COLUMNS,
  SIMPLE_TYPES,
  SELECT_TYPES,
  GROUP_OPEN,
  GROUP_CLOSE,
  formSchema,
} from './schema.js'

const TRANSLATABLE = new Set(['label', 'hint', 'constraint_message'])
const TRUEISH = new Set(['yes', 'true', '1'])
const FALSEISH = new Set(['', 'no', 'false', '0'])

/** Read a sheet as an array of rows (each an array of cells), preserving row indices. */
function readSheet(wb, name, XLSX) {
  const ws = wb.Sheets[name]
  if (!ws) return null
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' })
}

/** Parse a header row into column descriptors, splitting `base::Language (xx)` suffixes. */
function parseHeaders(headerRow) {
  return (headerRow || []).map((h, index) => {
    const raw = String(h ?? '').trim()
    const idx = raw.indexOf('::')
    const base = (idx === -1 ? raw : raw.slice(0, idx)).trim().toLowerCase()
    const lang = idx === -1 ? null : raw.slice(idx + 2).trim()
    return { index, base, lang, raw }
  })
}

function cell(row, index) {
  return String(row?.[index] ?? '').trim()
}

/** Single-valued column (prefers the unqualified header). */
function readSingle(cols, row, base) {
  const col = cols.find((c) => c.base === base && c.lang === null) || cols.find((c) => c.base === base)
  return col ? cell(row, col.index) : ''
}

/** Translatable column -> { language: text }, or undefined if empty. */
function readTranslated(cols, row, base, defaultLang) {
  const out = {}
  for (const col of cols) {
    if (col.base !== base) continue
    const val = cell(row, col.index)
    if (val === '') continue
    out[col.lang ?? defaultLang] = val
  }
  return Object.keys(out).length ? out : undefined
}

function collectLanguages(...colSets) {
  const langs = new Set()
  for (const cols of colSets) {
    for (const c of cols) {
      if (c.lang && TRANSLATABLE.has(c.base)) langs.add(c.lang)
    }
  }
  return langs
}

function parseBool(val) {
  return TRUEISH.has(val.toLowerCase())
}

/** required is yes/no, or an expression. Validate expressions here (§5.3). */
function parseRequired(val, rowNum) {
  const lower = val.toLowerCase()
  if (FALSEISH.has(lower)) return false
  if (TRUEISH.has(lower)) return true
  return validateExpr(val, rowNum, 'required') // an expression
}

/** Validate an expression column; return the raw string, or null if blank. Throws on bad grammar. */
function validateExpr(val, rowNum, columnName) {
  if (val === '') return null
  try {
    parseExpression(val)
  } catch (err) {
    throw new XlsformError(`Invalid ${columnName} expression: ${err.message}`, {
      row: rowNum,
      sheet: 'survey',
      value: val,
    })
  }
  return val
}

/** Parse the choices sheet into { list_name: [{ name, label }] }. */
function parseChoices(rows, defaultLang) {
  const map = {}
  if (!rows || rows.length === 0) return map
  const cols = parseHeaders(rows[0])
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const listName = readSingle(cols, row, 'list_name')
    const name = readSingle(cols, row, 'name')
    if (listName === '' && name === '') continue // blank row
    if (listName === '') {
      throw new XlsformError('Choice row is missing a list_name', { row: r + 1, sheet: 'choices' })
    }
    const label = readTranslated(cols, row, 'label', defaultLang) || {}
    ;(map[listName] ||= []).push({ name, label })
  }
  return map
}

/** Parse the settings sheet (header + one data row) into a flat object. */
function parseSettings(rows) {
  if (!rows || rows.length < 2) return {}
  const cols = parseHeaders(rows[0])
  const row = rows[1]
  const out = {}
  for (const col of cols) {
    if (col.base === '') continue
    const val = cell(row, col.index)
    if (val !== '') out[col.base] = val
  }
  return out
}

/**
 * Parse an in-memory SheetJS workbook.
 * @param {import('xlsx').WorkBook} wb
 * @param {typeof import('xlsx')} XLSX  the SheetJS module (injected so it can be lazy-loaded)
 * @returns {{ schema: import('./schema.js').FormSchema, warnings: string[], questionCount: number }}
 */
export function parseWorkbook(wb, XLSX) {
  const surveyRows = readSheet(wb, 'survey', XLSX)
  if (!surveyRows || surveyRows.length === 0) {
    throw new XlsformError('Missing required "survey" sheet', { sheet: 'survey' })
  }
  const choiceRows = readSheet(wb, 'choices', XLSX)
  const settingRows = readSheet(wb, 'settings', XLSX)

  const surveyCols = parseHeaders(surveyRows[0])
  const choiceCols = choiceRows ? parseHeaders(choiceRows[0]) : []

  const settings = parseSettings(settingRows)
  const languages = collectLanguages(surveyCols, choiceCols)
  const defaultLang =
    settings.default_language || (languages.size ? [...languages][0] : 'default')
  if (languages.size === 0) languages.add(defaultLang)

  const choices = parseChoices(choiceRows, defaultLang)

  // Warn once per unsupported survey column (§5.1).
  const warnings = []
  const warnedCols = new Set()
  for (const col of surveyCols) {
    if (col.base === '' || SURVEY_COLUMNS.includes(col.base)) continue
    if (warnedCols.has(col.raw)) continue
    warnedCols.add(col.raw)
    warnings.push(`Column "${col.raw}" is not supported and was ignored.`)
  }

  // Walk survey rows, nesting groups/repeats via a stack.
  const root = []
  const stack = [{ children: root, opener: null, closer: null, row: 0 }]
  const seenNames = new Set()
  let questionCount = 0

  for (let r = 1; r < surveyRows.length; r++) {
    const row = surveyRows[r]
    const rowNum = r + 1
    const typeRaw = readSingle(surveyCols, row, 'type')
    if (typeRaw === '') continue // blank row

    const parts = typeRaw.split(/\s+/)
    const baseType = parts[0].toLowerCase()
    const listName = parts[1]

    // Close a group/repeat.
    if (GROUP_CLOSE.has(baseType)) {
      const top = stack[stack.length - 1]
      if (!top.closer) {
        throw new XlsformError(`"${baseType}" has no matching opening row`, { row: rowNum, sheet: 'survey' })
      }
      if (top.closer !== baseType) {
        throw new XlsformError(
          `"${baseType}" does not match the open "${top.opener}" from row ${top.row}`,
          { row: rowNum, sheet: 'survey' }
        )
      }
      stack.pop()
      continue
    }

    const name = readSingle(surveyCols, row, 'name')

    // Structural open.
    if (GROUP_OPEN.has(baseType)) {
      if (name === '') {
        throw new XlsformError(`"${baseType}" requires a name`, { row: rowNum, sheet: 'survey' })
      }
      requireUniqueName(name, seenNames, rowNum)
      const node = buildField(surveyCols, row, rowNum, baseType, name, defaultLang)
      node.children = []
      stack[stack.length - 1].children.push(node)
      stack.push({
        children: node.children,
        opener: baseType,
        closer: baseType === 'begin_group' ? 'end_group' : 'end_repeat',
        row: rowNum,
      })
      continue
    }

    // A real question needs a name.
    if (name === '') {
      throw new XlsformError(`Question on row ${rowNum} is missing a name`, { row: rowNum, sheet: 'survey' })
    }
    requireUniqueName(name, seenNames, rowNum)

    const field = buildField(surveyCols, row, rowNum, baseType, name, defaultLang)

    if (SELECT_TYPES.has(baseType)) {
      if (!listName) {
        throw new XlsformError(`"${baseType}" is missing a choice list name`, {
          row: rowNum,
          sheet: 'survey',
          value: typeRaw,
        })
      }
      if (!choices[listName]) {
        throw new XlsformError(`Choice list "${listName}" was not found in the choices sheet`, {
          row: rowNum,
          sheet: 'survey',
          value: typeRaw,
        })
      }
      field.list_name = listName
      field.choices = choices[listName]
    } else if (!SIMPLE_TYPES.has(baseType)) {
      // Unsupported type — fail loudly, naming row and type (§5.2).
      throw new XlsformError(`Unsupported question type "${typeRaw}"`, {
        row: rowNum,
        sheet: 'survey',
        value: typeRaw,
      })
    }

    stack[stack.length - 1].children.push(field)
    questionCount++
  }

  if (stack.length !== 1) {
    const top = stack[stack.length - 1]
    throw new XlsformError(`"${top.opener}" opened on row ${top.row} is never closed`, {
      row: top.row,
      sheet: 'survey',
    })
  }

  const schema = formSchema.parse({
    settings: {
      form_title: settings.form_title,
      form_id: settings.form_id,
      version: settings.version,
      default_language: defaultLang,
      ...settings,
    },
    languages: [...languages],
    fields: root,
  })

  return { schema, warnings, questionCount }
}

function requireUniqueName(name, seen, rowNum) {
  if (seen.has(name)) {
    throw new XlsformError(`Duplicate question name "${name}"`, { row: rowNum, sheet: 'survey' })
  }
  seen.add(name)
}

/** Build the common field object (labels, hint, expressions, flags). */
function buildField(cols, row, rowNum, baseType, name, defaultLang) {
  return {
    type: baseType,
    name,
    label: readTranslated(cols, row, 'label', defaultLang),
    hint: readTranslated(cols, row, 'hint', defaultLang),
    required: parseRequired(readSingle(cols, row, 'required'), rowNum),
    relevant: validateExpr(readSingle(cols, row, 'relevant'), rowNum, 'relevant'),
    constraint: validateExpr(readSingle(cols, row, 'constraint'), rowNum, 'constraint'),
    constraint_message: readTranslated(cols, row, 'constraint_message', defaultLang),
    appearance: readSingle(cols, row, 'appearance') || null,
    calculation: validateExpr(readSingle(cols, row, 'calculation'), rowNum, 'calculation'),
    default: readSingle(cols, row, 'default') || null,
    read_only: parseBool(readSingle(cols, row, 'read_only')),
  }
}

/**
 * Parse an XLSForm from a file buffer. Async because it lazy-loads the heavy `xlsx` module.
 * @param {Buffer | Uint8Array | ArrayBuffer} buffer
 * @returns {Promise<{ schema: import('./schema.js').FormSchema, warnings: string[], questionCount: number }>}
 */
export async function parseXlsform(buffer) {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb = XLSX.read(buffer, { type: 'buffer' })
  } catch (err) {
    // A malicious/corrupt workbook must fail the parse cleanly, not crash the server (§10).
    throw new XlsformError(`Could not read the spreadsheet: ${err.message}`)
  }
  return parseWorkbook(wb, XLSX)
}
