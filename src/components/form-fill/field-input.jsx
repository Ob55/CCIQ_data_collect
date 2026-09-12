'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { labelFor, textFor } from '@/lib/runtime-eval'

/** Space-delimited select_multiple helpers (ODK storage format). */
const asTokens = (v) => String(v ?? '').split(/\s+/).filter(Boolean)
const toStr = (tokens) => tokens.join(' ')

/**
 * One leaf question input. `value` and `onChange` are the field's own value.
 * @param {{ field: any, value: any, onChange: (v:any)=>void, language: string, submissionId: string, error?: string }} props
 */
export function FieldInput({ field, value, onChange, language, submissionId, error }) {
  const { type, name, read_only } = field
  const label = labelFor(field, language)
  const hint = textFor(field.hint, language)
  const required = field.required === true

  if (type === 'note') {
    return <p className="text-sm text-muted-foreground">{label}</p>
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      <Control
        field={field}
        value={value}
        onChange={onChange}
        language={language}
        submissionId={submissionId}
        disabled={read_only || type === 'calculate'}
      />

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Control({ field, value, onChange, language, submissionId, disabled }) {
  const { type, name } = field

  switch (type) {
    case 'integer':
      return (
        <Input
          id={name}
          type="number"
          step="1"
          inputMode="numeric"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
        />
      )
    case 'decimal':
      return (
        <Input
          id={name}
          type="number"
          step="any"
          inputMode="decimal"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        />
      )
    case 'date':
    case 'time':
    case 'datetime':
      return (
        <Input
          id={name}
          type={type === 'datetime' ? 'datetime-local' : type}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'calculate':
      return <Input id={name} readOnly value={value ?? ''} className="bg-muted" />
    case 'select_one':
      return (
        <div className="space-y-1.5">
          {(field.choices ?? []).map((c) => (
            <label key={c.name} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                className="h-4 w-4"
                disabled={disabled}
                checked={value === c.name}
                onChange={() => onChange(c.name)}
              />
              {textFor(c.label, language) || c.name}
            </label>
          ))}
        </div>
      )
    case 'select_multiple': {
      const tokens = asTokens(value)
      return (
        <div className="space-y-1.5">
          {(field.choices ?? []).map((c) => (
            <label key={c.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                disabled={disabled}
                checked={tokens.includes(c.name)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...tokens, c.name]
                    : tokens.filter((t) => t !== c.name)
                  onChange(toStr(next))
                }}
              />
              {textFor(c.label, language) || c.name}
            </label>
          ))}
        </div>
      )
    }
    case 'geopoint':
      return <GeoPoint value={value} onChange={onChange} disabled={disabled} />
    case 'image':
      return (
        <ImageUpload
          value={value}
          onChange={onChange}
          submissionId={submissionId}
          questionName={name}
          disabled={disabled}
        />
      )
    case 'text':
    default:
      return (
        <Input
          id={name}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

function GeoPoint({ value, onChange, disabled }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function capture() {
    setErr('')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(`${pos.coords.latitude} ${pos.coords.longitude}`)
        setBusy(false)
      },
      (e) => {
        setErr(e.message)
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={capture} disabled={disabled || busy}>
          {busy ? 'Locating…' : 'Capture location'}
        </Button>
        {value ? <span className="font-mono text-xs text-muted-foreground">{value}</span> : null}
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  )
}

function ImageUpload({ value, onChange, submissionId, questionName, disabled }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Normalize: value may be an array (new), a single object (old drafts), or empty.
  const items = Array.isArray(value) ? value : value?.storage_path ? [value] : []

  async function onFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setErr('')
    setBusy(true)
    const added = []
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('submission_id', submissionId)
        fd.set('question_name', questionName)
        const res = await fetch('/api/attachments', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Upload failed')
        added.push({ storage_path: json.storage_path, mime_type: json.mime_type, size_bytes: json.size_bytes })
      }
      onChange([...items, ...added])
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
      e.target.value = '' // let the same file be re-selected if needed
    }
  }

  const removeAt = (i) => onChange(items.filter((_, j) => j !== i))

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={disabled || busy}
        onChange={onFiles}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {busy ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li
              key={it.storage_path || i}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
            >
              <span className="truncate text-green-700">Photo {i + 1} attached ✓</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  )
}
