// @ts-check
// From-scratch form builder → runtime form schema (§5.5). Pure (no DB, no server-only), so the
// produced schema is validated against the same `formSchema` the XLSForm parser emits and the
// runtime renderer/exporter can treat both identically. Kept separate from the DB service so it
// stays unit-testable.
import { formSchema } from './schema.js'

const SELECT_TYPES = new Set(['select_one', 'select_multiple'])

/** Turn a label into a safe, unique snake_case identifier for a question/choice name. */
export function toName(source, seen, fallback) {
  let base = String(source || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  if (!base || /^[0-9]/.test(base)) base = base ? `${fallback}_${base}` : fallback
  let name = base
  let i = 2
  while (seen.has(name)) name = `${base}_${i++}`
  seen.add(name)
  return name
}

/**
 * Build a validated runtime form schema from a builder payload. Auto-generates unique
 * question/choice names and validates against `formSchema`.
 * @param {{ title: string, fields: Array<{ type: string, label: string, name?: string, hint?: string, required?: boolean, choices?: {label:string}[] }> }} payload
 * @returns {import('./schema.js').FormSchema}
 */
export function buildRuntimeSchema({ title, fields }) {
  const seen = new Set()
  const outFields = fields.map((f, idx) => {
    const name = toName(f.name || f.label, seen, `q${idx + 1}`)
    /** @type {any} */
    const field = {
      type: f.type,
      name,
      label: { default: f.label },
      required: !!f.required,
      relevant: null,
      constraint: null,
      appearance: null,
      calculation: null,
      default: null,
      read_only: false,
    }
    if (f.hint) field.hint = { default: f.hint }
    if (SELECT_TYPES.has(f.type)) {
      const choiceSeen = new Set()
      field.list_name = `${name}_choices`
      field.choices = (f.choices || []).map((c) => ({
        name: toName(c.label, choiceSeen, 'opt'),
        label: { default: c.label },
      }))
    }
    return field
  })

  return formSchema.parse({
    settings: { form_title: title, default_language: 'default' },
    languages: ['default'],
    fields: outFields,
  })
}
