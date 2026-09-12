'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2, Plus, GripVertical } from 'lucide-react'
import { createBuilderFormAction } from '../actions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

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
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))
const isSelect = (t) => t === 'select_one' || t === 'select_multiple'

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/** From-scratch form builder (§5.5). Produces a draft form + version without an XLSForm upload. */
export function FormBuilder() {
  const router = useRouter()
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
    // Fast client-side checks; the server validates authoritatively.
    if (!title.trim()) return setError('Give the form a title.')
    if (fields.length === 0) return setError('Add at least one question.')
    for (const f of fields) {
      if (!f.label.trim()) return setError('Every question needs a label.')
      if (isSelect(f.type) && f.choices.filter((c) => c.label.trim()).length === 0)
        return setError(`"${f.label}" is a choice question — add at least one option.`)
    }

    setSaving(true)
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
    const res = await createBuilderFormAction(payload)
    if (res?.ok) {
      router.push(`/forms/${res.formId}`)
    } else {
      setError(res?.error || 'Could not create the form.')
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
