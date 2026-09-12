// @ts-check
// Constants + Zod schema for the parsed XLSForm JSON (PRD §5). The runtime renderer and
// exporter read only this JSON, never the spreadsheet, so it must be validated (PRD §4.1).
import { z } from 'zod'

// Survey columns we read. Any other column is ignored with a warning (§5.1).
export const SURVEY_COLUMNS = [
  'type',
  'name',
  'label',
  'hint',
  'required',
  'relevant',
  'constraint',
  'constraint_message',
  'appearance',
  'calculation',
  'default',
  'read_only',
]

// Question types with no list argument (§5.2).
export const SIMPLE_TYPES = new Set([
  'text',
  'integer',
  'decimal',
  'date',
  'time',
  'datetime',
  'note',
  'image',
  'geopoint',
  'calculate',
])

// Types that take a choice-list name, e.g. "select_one yes_no".
export const SELECT_TYPES = new Set(['select_one', 'select_multiple'])

// Structural markers.
export const GROUP_OPEN = new Set(['begin_group', 'begin_repeat'])
export const GROUP_CLOSE = new Set(['end_group', 'end_repeat'])

// label / hint / constraint_message can carry per-language variants: { 'English (en)': '...' }.
const translatedText = z.record(z.string(), z.string())

// A choice option within a list.
export const choiceSchema = z.object({
  name: z.string(),
  label: translatedText,
})

/** @type {z.ZodType<any>} */
export const fieldSchema = z.lazy(() =>
  z.object({
    type: z.string(), // normalized base type, e.g. 'text', 'select_one', 'begin_group'
    name: z.string(),
    label: translatedText.optional(),
    hint: translatedText.optional(),
    // required is either a boolean or an expression string (validated at parse time).
    required: z.union([z.boolean(), z.string()]).default(false),
    relevant: z.string().nullable().default(null),
    constraint: z.string().nullable().default(null),
    constraint_message: translatedText.optional(),
    appearance: z.string().nullable().default(null),
    calculation: z.string().nullable().default(null),
    default: z.string().nullable().default(null),
    read_only: z.boolean().default(false),
    // selects only:
    list_name: z.string().optional(),
    choices: z.array(choiceSchema).optional(),
    // groups / repeats only:
    children: z.array(fieldSchema).optional(),
  })
)

export const formSchema = z.object({
  settings: z.object({
    form_title: z.string().optional(),
    form_id: z.string().optional(),
    version: z.string().optional(),
    default_language: z.string().optional(),
  }).passthrough(),
  languages: z.array(z.string()).min(1),
  fields: z.array(fieldSchema),
})

/** @typedef {z.infer<typeof formSchema>} FormSchema */
