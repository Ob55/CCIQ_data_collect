// @ts-check
// Pure export-shaping logic (PRD §9): flatten a form schema into columns in original
// question order, merge columns across versions, and build sheet arrays. No I/O here, so
// it is fully unit-testable. Repeat groups become their own long-format sheets.
import { labelFor } from '@/lib/runtime-eval'

// Metadata columns included on the main sheet (§9). [key, header].
const META = [
  ['id', 'Submission ID'],
  ['enumerator', 'Enumerator'],
  ['role', 'Submitter role'],
  ['submitted_at', 'Submitted at'],
  ['duration', 'Duration (s)'],
  ['status', 'Status'],
  ['comment', 'Review comment'],
  ['version_no', 'Form version'],
]

function collectLeafCols(fields, out, lang) {
  for (const f of fields) {
    if (f.type === 'note') continue
    if (f.type === 'begin_group') collectLeafCols(f.children ?? [], out, lang)
    else if (f.type === 'begin_repeat') {
      // A repeat nested inside a repeat is exported as a JSON cell (rare; deeper nesting is uncommon).
      out.push({ name: f.name, label: labelFor(f, lang), type: 'nested_repeat' })
    } else {
      out.push({ name: f.name, label: labelFor(f, lang), type: f.type })
    }
  }
}

/** Flatten one schema into { main: [col], repeats: [{name,label,columns:[col]}] }. */
export function flattenSchema(schema, lang) {
  const main = []
  const repeats = []
  function walk(fields) {
    for (const f of fields) {
      if (f.type === 'note') continue
      if (f.type === 'begin_group') walk(f.children ?? [])
      else if (f.type === 'begin_repeat') {
        const cols = []
        collectLeafCols(f.children ?? [], cols, lang)
        repeats.push({ name: f.name, label: labelFor(f, lang), columns: cols })
      } else {
        main.push({ name: f.name, label: labelFor(f, lang), type: f.type })
      }
    }
  }
  walk(schema?.fields ?? [])
  return { main, repeats }
}

/** Merge columns across versions, preserving first-seen order (oldest version first). */
export function mergeSchemas(versions, lang) {
  const mainMap = new Map()
  const repeatMap = new Map()
  for (const v of versions) {
    const { main, repeats } = flattenSchema(v.schema, lang)
    for (const c of main) if (!mainMap.has(c.name)) mainMap.set(c.name, c)
    for (const r of repeats) {
      if (!repeatMap.has(r.name)) repeatMap.set(r.name, { name: r.name, label: r.label, cols: new Map() })
      const rm = repeatMap.get(r.name)
      for (const c of r.columns) if (!rm.cols.has(c.name)) rm.cols.set(c.name, c)
    }
  }
  return {
    main: [...mainMap.values()],
    repeats: [...repeatMap.values()].map((r) => ({
      name: r.name,
      label: r.label,
      columns: [...r.cols.values()],
    })),
  }
}

function cellValue(col, value, imageUrlMap) {
  if (value === undefined || value === null) return ''
  if (col.type === 'image') {
    // One or many photos → newline-separated (signed) URLs in a single cell.
    const items = Array.isArray(value) ? value : value ? [value] : []
    return items
      .map((it) => (it?.storage_path ? imageUrlMap[it.storage_path] || it.storage_path : ''))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

/**
 * Build sheet arrays from prepared submissions.
 * @param {{ merged: {main,repeats}, submissions: any[], headerMode: 'names'|'labels', imageUrlMap: Record<string,string> }} args
 * @returns {{ main: any[][], repeats: Array<{name:string, aoa:any[][]}> }}
 */
export function buildSheets({ merged, submissions, headerMode, imageUrlMap = {} }) {
  const head = (col) => (headerMode === 'names' ? col.name : col.label || col.name)

  const mainHeader = [...META.map((m) => m[1]), ...merged.main.map(head)]
  const mainRows = submissions.map((s) => [
    s.id,
    s.enumerator,
    s.role,
    s.submitted_at,
    s.duration ?? '',
    s.status,
    s.comment ?? '',
    s.version_no,
    ...merged.main.map((col) => cellValue(col, s.data?.[col.name], imageUrlMap)),
  ])

  const repeats = merged.repeats.map((r) => {
    const header = ['Submission ID', ...r.columns.map(head)]
    const rows = []
    for (const s of submissions) {
      const instances = Array.isArray(s.data?.[r.name]) ? s.data[r.name] : []
      for (const inst of instances) {
        rows.push([s.id, ...r.columns.map((col) => cellValue(col, inst?.[col.name], imageUrlMap))])
      }
    }
    return { name: r.name, aoa: [header, ...rows] }
  })

  return { main: [mainHeader, ...mainRows], repeats }
}

/** Recursively collect image storage paths from a submission's data (for signing). */
export function collectImagePaths(data, set) {
  for (const val of Object.values(data ?? {})) {
    if (Array.isArray(val)) {
      for (const v of val) {
        if (v && typeof v === 'object') {
          if (v.storage_path) set.add(v.storage_path) // one of several photos
          else collectImagePaths(v, set) // repeat instance
        }
      }
    } else if (val && typeof val === 'object') {
      if (val.storage_path) set.add(val.storage_path)
      else collectImagePaths(val, set)
    }
  }
}
