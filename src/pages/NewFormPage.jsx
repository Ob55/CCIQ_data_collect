import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PencilRuler,
  Upload,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  GripVertical,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'
import {
  parseUploadPreview,
  createFormFromUpload,
  createFormFromSchema,
  buildRuntimeSchema,
} from '@/lib/forms'
import { builderFormSchema, createFormSchema } from '@/lib/schemas'
import { XlsformError } from '@/lib/xlsform/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Format any thrown error into a user-facing message with row context when available. */
function toMessage(err) {
  if (err instanceof XlsformError) {
    const where = err.row ? ` (row ${err.row})` : ''
    return `${err.message}${where}`
  }
  return err?.message || 'Something went wrong.'
}

const MODES = [
  { key: 'build', label: 'Build from scratch', icon: PencilRuler, hint: 'Add questions one by one — no spreadsheet needed.' },
  { key: 'upload', label: 'Upload XLSForm', icon: Upload, hint: 'Already have an .xlsx? Import it with a parse report.' },
]

/** Route page: pick a creation mode, then either build from scratch or upload an XLSForm (§5.5). */
export function NewFormPage() {
  const [mode, setMode] = useState('build')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New form</h1>
        <p className="text-muted-foreground">
          Build a form question by question, or import an existing <code>.xlsx</code> XLSForm.
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const Icon = m.icon
            const active = mode === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={active}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  active ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:bg-accent'
                )}
              >
                <span
                  className={cn(
                    'rounded-md p-2',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{m.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{m.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        {mode === 'build' ? <FormBuilder /> : <UploadForm />}
      </div>
    </div>
  )
}

// ── Upload mode ──────────────────────────────────────────────────────────────
// Two-step flow (PRD §7): parse-and-report first, then confirm to create a draft.
function UploadForm() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [file, setFile] = useState(null)
  const [report, setReport] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [parseError, setParseError] = useState('')
  const [createError, setCreateError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef(null)

  async function onParse(e) {
    e.preventDefault()
    setParseError('')
    setReport(null)
    const f = inputRef.current?.files?.[0]
    const chosen = f && f.size > 0 ? f : null
    setFile(chosen)
    if (!chosen) {
      setParseError('No file was uploaded.')
      return
    }
    setParsing(true)
    try {
      const { schema, warnings, questionCount } = await parseUploadPreview(chosen)
      setReport({
        questionCount,
        warnings,
        languages: schema.languages,
        title: schema.settings.form_title ?? '',
      })
      setTitle(schema.settings.form_title ?? '')
    } catch (err) {
      setParseError(toMessage(err))
    } finally {
      setParsing(false)
    }
  }

  async function onCreate(e) {
    e.preventDefault()
    setCreateError('')
    const parsed = createFormSchema.safeParse({ title, description })
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Invalid input.')
      return
    }
    if (!file) {
      setCreateError('No file was uploaded.')
      return
    }
    setCreating(true)
    try {
      const { formId } = await createFormFromUpload({
        actorId: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        file,
      })
      navigate(`/forms/${formId}`)
    } catch (err) {
      setCreateError(toMessage(err))
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a file</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onParse} className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            <Button type="submit" disabled={parsing}>
              {parsing ? 'Parsing…' : 'Parse & preview'}
            </Button>
          </form>

          {parseError ? (
            <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {parseError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Parse report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Questions</dt>
              <dd className="col-span-2 font-medium">{report.questionCount}</dd>
              <dt className="text-muted-foreground">Languages</dt>
              <dd className="col-span-2 font-medium">{report.languages.join(', ')}</dd>
              <dt className="text-muted-foreground">Warnings</dt>
              <dd className="col-span-2 font-medium">{report.warnings.length}</dd>
            </dl>

            {report.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 rounded-md bg-amber-50 p-3 pl-8 text-sm text-amber-800">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-green-700">No warnings — clean parse.</p>
            )}

            <form onSubmit={onCreate} className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Form title</Label>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {createError ? (
                <p role="alert" className="text-sm text-destructive">
                  {createError}
                </p>
              ) : null}
              <Button type="submit" disabled={creating || !file}>
                {creating ? 'Creating…' : 'Create draft form'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Creates a <strong>draft</strong>. You deploy it from the form page — never straight from upload.
              </p>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ── Builder mode ─────────────────────────────────────────────────────────────
// Each builder type maps 1:1 to a runtime question type the renderer already handles.
const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'integer', label: 'Number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'select_one', label: 'Choose one' },
  { value: 'select_multiple', label: 'Choose many' },
  { value: 'date', label: 'Date' },
  { value: 'note', label: 'Note (display only)' },
  { value: 'image', label: 'Photo' },
  { value: 'geopoint', label: 'Location (GPS)' },
]
const isSelect = (t) => t === 'select_one' || t === 'select_multiple'

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/** From-scratch form builder (§5.5). Produces a draft form + version without an XLSForm upload. */
function FormBuilder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const idRef = useRef(1)
  const nextId = () => idRef.current++

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function addField(type = 'text') {
    setFields((prev) => [
      ...prev,
      { id: nextId(), type, label: '', name: '', hint: '', required: false, choices: [] },
    ])
  }
  const patchField = (id, patch) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const removeField = (id) => setFields((prev) => prev.filter((f) => f.id !== id))
  function moveField(id, dir) {
    setFields((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function changeType(id, type) {
    patchField(id, {
      type,
      choices: isSelect(type)
        ? (fields.find((f) => f.id === id)?.choices.length
            ? fields.find((f) => f.id === id).choices
            : [{ id: nextId(), label: '' }])
        : [],
    })
  }
  const addChoice = (fid) =>
    patchField(fid, {
      choices: [...fields.find((f) => f.id === fid).choices, { id: nextId(), label: '' }],
    })
  const patchChoice = (fid, cid, label) =>
    setFields((prev) =>
      prev.map((f) =>
        f.id === fid
          ? { ...f, choices: f.choices.map((c) => (c.id === cid ? { ...c, label } : c)) }
          : f
      )
    )
  const removeChoice = (fid, cid) =>
    setFields((prev) =>
      prev.map((f) =>
        f.id === fid ? { ...f, choices: f.choices.filter((c) => c.id !== cid) } : f
      )
    )

  async function save() {
    setError('')
    // Fast client-side checks; the schema validates authoritatively below.
    if (!title.trim()) return setError('Give the form a title.')
    if (fields.length === 0) return setError('Add at least one question.')
    for (const f of fields) {
      if (!f.label.trim()) return setError('Every question needs a label.')
      if (isSelect(f.type) && f.choices.filter((c) => c.label.trim()).length === 0)
        return setError(`"${f.label}" is a choice question — add at least one option.`)
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      fields: fields.map((f) => ({
        type: f.type,
        label: f.label.trim(),
        name: f.name.trim() || undefined,
        hint: f.hint.trim(),
        required: f.required,
        choices: isSelect(f.type)
          ? f.choices.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim() }))
          : [],
      })),
    }

    const parsed = builderFormSchema.safeParse(payload)
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? 'Please check the form.')
    }

    setSaving(true)
    try {
      const schema = buildRuntimeSchema(parsed.data)
      const { formId } = await createFormFromSchema({
        actorId: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        schema,
      })
      navigate(`/forms/${formId}`)
    } catch (err) {
      setError(toMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="builder-title">Form title</Label>
            <Input
              id="builder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Household Cookstove Survey"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="builder-desc">Description (optional)</Label>
            <Textarea
              id="builder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this form for?"
            />
          </div>
        </CardContent>
      </Card>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No questions yet. Add your first question to start building.
            </p>
            <Button type="button" onClick={() => addField('text')}>
              <Plus className="mr-1.5 h-4 w-4" /> Add question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fields.map((f, idx) => (
            <Card key={f.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-2 flex flex-col items-center text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="mt-1 text-xs font-medium tabular-nums">{idx + 1}</span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <Input
                      value={f.label}
                      onChange={(e) => patchField(f.id, { label: e.target.value })}
                      placeholder="Question label — what the enumerator sees"
                      className="text-base font-medium"
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        aria-label="Question type"
                        className={cn(selectClass, 'w-auto min-w-[10rem]')}
                        value={f.type}
                        onChange={(e) => changeType(f.id, e.target.value)}
                      >
                        {TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>

                      {f.type !== 'note' ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={f.required}
                            onChange={(e) => patchField(f.id, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      ) : null}

                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Move up"
                          onClick={() => moveField(f.id, -1)}
                          disabled={idx === 0}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          onClick={() => moveField(f.id, 1)}
                          disabled={idx === fields.length - 1}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete question"
                          onClick={() => removeField(f.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isSelect(f.type) ? (
                      <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Options
                        </div>
                        {f.choices.map((c) => (
                          <div key={c.id} className="flex items-center gap-2">
                            <Input
                              value={c.label}
                              onChange={(e) => patchChoice(f.id, c.id, e.target.value)}
                              placeholder="Option label"
                              className="h-9 bg-background"
                            />
                            <button
                              type="button"
                              aria-label="Remove option"
                              onClick={() => removeChoice(f.id, c.id)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addChoice(f.id)}
                          className="text-primary"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add option
                        </Button>
                      </div>
                    ) : null}

                    <details className="text-sm">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Advanced
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`hint-${f.id}`} className="text-xs">
                            Hint (optional)
                          </Label>
                          <Input
                            id={`hint-${f.id}`}
                            value={f.hint}
                            onChange={(e) => patchField(f.id, { hint: e.target.value })}
                            placeholder="Helper text under the question"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`name-${f.id}`} className="text-xs">
                            Data column name (optional)
                          </Label>
                          <Input
                            id={`name-${f.id}`}
                            value={f.name}
                            onChange={(e) => patchField(f.id, { name: e.target.value })}
                            placeholder="auto-generated from the label"
                            className="h-9 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={() => addField('text')} className="w-full border-dashed">
            <Plus className="mr-1.5 h-4 w-4" /> Add question
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Creates a <strong>draft</strong>. Deploy it from the form page when it&apos;s ready.
        </p>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Creating…' : 'Create draft form'}
        </Button>
      </div>
    </div>
  )
}
