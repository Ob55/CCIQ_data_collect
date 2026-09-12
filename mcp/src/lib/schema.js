// @ts-check
// Pure helpers for reading a parsed XLSForm schema and rendering a submission against it.
// Mirrors the logic in the web app (src/lib/runtime-eval.js:labelFor and
// src/lib/export-build.js:flattenSchema). Re-implemented here to keep this package
// standalone (the app modules use the Next `@/` alias and `server-only`). No I/O — unit-tested.

const SELECT_ONE = 'select_one'
const SELECT_MULTIPLE = 'select_multiple'

/** Pick a label string for the active language, with sensible fallbacks. */
export function labelFor(field, language) {
  const l = field?.label
  if (!l) return field?.name ?? ''
  if (typeof l === 'string') return l
  return l[language] ?? Object.values(l)[0] ?? field.name ?? ''
}

/** Human-readable choices for a select field: [{ value, label }]. */
function choiceOptions(field, lang) {
  return (field.choices ?? []).map((c) => ({ value: c.name, label: labelFor(c, lang) }))
}

/** Map a select field's stored value(s) to choice labels. */
function choiceLabel(field, value, lang) {
  const byValue = new Map((field.choices ?? []).map((c) => [c.name, labelFor(c, lang)]))
  if (field.type === SELECT_MULTIPLE) {
    // ODK stores select_multiple as a space-delimited string of choice values.
    const tokens = String(value ?? '')
      .split(/\s+/)
      .filter(Boolean)
    return tokens.map((t) => byValue.get(t) ?? t).join(', ')
  }
  return byValue.get(value) ?? value
}

/**
 * Flatten a schema into columns for the `get_form_schema` tool.
 * Groups merge into the main list (in original order); repeats become their own blocks.
 * @returns {{ main: Array<{name,label,type,choices?}>, repeats: Array<{name,label,columns}> }}
 */
export function flattenSchema(schema, lang) {
  const main = []
  const repeats = []

  function column(f) {
    const col = { name: f.name, label: labelFor(f, lang), type: f.type }
    if (f.type === SELECT_ONE || f.type === SELECT_MULTIPLE) col.choices = choiceOptions(f, lang)
    return col
  }

  function walkRepeat(fields, out) {
    for (const f of fields) {
      if (f.type === 'note') continue
      if (f.type === 'begin_group') walkRepeat(f.children ?? [], out)
      else if (f.type === 'begin_repeat')
        out.push({ name: f.name, label: labelFor(f, lang), type: 'nested_repeat' })
      else out.push(column(f))
    }
  }

  function walk(fields) {
    for (const f of fields) {
      if (f.type === 'note') continue
      if (f.type === 'begin_group') walk(f.children ?? [])
      else if (f.type === 'begin_repeat') {
        const cols = []
        walkRepeat(f.children ?? [], cols)
        repeats.push({ name: f.name, label: labelFor(f, lang), columns: cols })
      } else main.push(column(f))
    }
  }

  walk(schema?.fields ?? [])
  return { main, repeats }
}

/** Render one field's stored value into a human-readable value. */
function renderValue(field, value, lang, imageUrlMap) {
  if (value === undefined || value === null || value === '') return ''
  if (field.type === SELECT_ONE || field.type === SELECT_MULTIPLE) {
    return choiceLabel(field, value, lang)
  }
  if (field.type === 'image') {
    const path = value?.storage_path
    return path ? imageUrlMap[path] || path : ''
  }
  if (field.type === 'geopoint') {
    if (value && typeof value === 'object') {
      const { lat, lng, latitude, longitude } = value
      return `${lat ?? latitude ?? ''}, ${lng ?? longitude ?? ''}`.trim()
    }
    return value
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

/**
 * Render a list of fields into a labelled, human-readable object against `values`.
 * Groups are flattened inline; repeats become arrays of rendered instances.
 */
function renderFields(fields, values, lang, imageUrlMap) {
  const out = {}
  const put = (key, val) => {
    // Guard against duplicate labels so nothing is silently overwritten.
    out[key in out ? `${key} (${Object.keys(out).length})` : key] = val
  }

  for (const f of fields ?? []) {
    if (f.type === 'note') continue
    if (f.type === 'begin_group') {
      Object.assign(out, renderFields(f.children ?? [], values, lang, imageUrlMap))
    } else if (f.type === 'begin_repeat') {
      const instances = Array.isArray(values?.[f.name]) ? values[f.name] : []
      put(
        labelFor(f, lang),
        instances.map((inst) => renderFields(f.children ?? [], inst, lang, imageUrlMap))
      )
    } else {
      put(labelFor(f, lang), renderValue(f, values?.[f.name], lang, imageUrlMap))
    }
  }
  return out
}

/**
 * Render a submission's `data` into a labelled, human-readable object against its schema.
 * @param {any} schema  parsed form schema { languages, fields }
 * @param {Record<string, any>} data  the submission's jsonb payload
 * @param {string} lang  active language code
 * @param {Record<string, string>} imageUrlMap  storage_path -> signed URL
 * @returns {Record<string, any>}
 */
export function renderSubmission(schema, data, lang, imageUrlMap = {}) {
  return renderFields(schema?.fields ?? [], data ?? {}, lang, imageUrlMap)
}

/** Collect image storage paths from a submission's data (for signing). */
export function collectImagePaths(data, set) {
  for (const val of Object.values(data ?? {})) {
    if (Array.isArray(val)) {
      val.forEach((v) => v && typeof v === 'object' && collectImagePaths(v, set))
    } else if (val && typeof val === 'object') {
      if (val.storage_path) set.add(val.storage_path)
      else collectImagePaths(val, set)
    }
  }
}
