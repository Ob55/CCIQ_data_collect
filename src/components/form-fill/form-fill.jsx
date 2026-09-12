import { useState, useEffect, useCallback } from 'react'
import { FieldInput } from './field-input'
import { submitFilledForm } from '@/lib/submissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  isRelevant,
  isRequired,
  passesConstraint,
  calculate,
  labelFor,
  textFor,
} from '@/lib/runtime-eval'

// Immutable set at a path of object keys / array indices.
function setIn(obj, path, value) {
  if (path.length === 0) return value
  const [k, ...rest] = path
  const clone = Array.isArray(obj) ? obj.slice() : { ...(obj ?? {}) }
  clone[k] = setIn(clone[k], rest, value)
  return clone
}

// Build the submission payload: relevant fields only, groups flattened, repeats as arrays,
// calculates computed. Mirrors the render walk.
function buildData(fields, scope, topValues) {
  const out = {}
  const context = { ...topValues, ...scope }
  for (const f of fields) {
    if (!isRelevant(f.relevant, context)) continue
    if (f.type === 'begin_group') {
      Object.assign(out, buildData(f.children ?? [], scope, topValues))
    } else if (f.type === 'begin_repeat') {
      const arr = Array.isArray(scope[f.name]) ? scope[f.name] : []
      out[f.name] = arr.map((inst) => buildData(f.children ?? [], inst, topValues))
    } else if (f.type === 'calculate') {
      out[f.name] = calculate(f.calculation, context)
    } else if (f.type !== 'note') {
      const v = scope[f.name]
      if (v !== undefined && v !== '') out[f.name] = v
    }
  }
  return out
}

// Find image attachments anywhere in the built data. An image field's value may be a single
// attachment object OR an array of them (multiple photos); repeat instances are arrays of objects.
function collectAttachments(data) {
  const found = []
  const push = (key, v) =>
    found.push({
      question_name: key,
      storage_path: v.storage_path,
      mime_type: v.mime_type,
      size_bytes: v.size_bytes,
    })
  const walk = (obj) => {
    for (const [key, val] of Object.entries(obj ?? {})) {
      if (Array.isArray(val)) {
        for (const v of val) {
          if (v && typeof v === 'object') {
            if (v.storage_path) push(key, v) // one of several photos for this question
            else walk(v) // a repeat instance
          }
        }
      } else if (val && typeof val === 'object' && val.storage_path) {
        push(key, val)
      }
    }
  }
  walk(data)
  return found
}

// Validate relevant fields: required + constraint. Returns { pathKey: message }.
function validate(fields, scope, topValues, language, basePath = []) {
  let errors = {}
  const context = { ...topValues, ...scope }
  for (const f of fields) {
    if (!isRelevant(f.relevant, context)) continue
    const path = [...basePath, f.name]
    const key = path.join('.')
    if (f.type === 'begin_group') {
      errors = { ...errors, ...validate(f.children ?? [], scope, topValues, language, basePath) }
    } else if (f.type === 'begin_repeat') {
      const arr = Array.isArray(scope[f.name]) ? scope[f.name] : []
      arr.forEach((inst, i) => {
        errors = {
          ...errors,
          ...validate(f.children ?? [], inst, topValues, language, [...path, i]),
        }
      })
    } else if (f.type !== 'note' && f.type !== 'calculate') {
      const value = scope[f.name]
      const empty = value === undefined || value === '' || value === null
      if (isRequired(f.required, context) && empty) {
        errors[key] = 'This question is required.'
      } else if (!passesConstraint(f.constraint, context, value)) {
        errors[key] = textFor(f.constraint_message, language) || 'This value is not allowed.'
      }
    }
  }
  return errors
}

/**
 * @param {{ form: any, version: any }} props version.schema is the parsed XLSForm.
 */
export function FormFill({ form, version }) {
  const schema = version.schema
  const storageKey = `ccc-draft-${version.id}`

  const [language, setLanguage] = useState(schema.languages?.[0] ?? 'default')
  const [values, setValues] = useState({})
  const [submissionId, setSubmissionId] = useState('')
  const [startedAt, setStartedAt] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  // Restore a saved draft, or start a fresh one (a stable id gives us idempotency).
  useEffect(() => {
    let restored = null
    try {
      restored = JSON.parse(localStorage.getItem(storageKey) || 'null')
    } catch {
      restored = null
    }
    if (restored?.submissionId) {
      setValues(restored.values ?? {})
      setSubmissionId(restored.submissionId)
      setStartedAt(restored.startedAt ?? Date.now())
    } else {
      setSubmissionId(crypto.randomUUID())
      setStartedAt(Date.now())
    }
  }, [storageKey])

  // Autosave every 5 seconds (PRD §7) — localStorage only, no server, no sync queue.
  useEffect(() => {
    if (!submissionId) return
    const t = setInterval(() => {
      localStorage.setItem(storageKey, JSON.stringify({ values, submissionId, startedAt }))
    }, 5000)
    return () => clearInterval(t)
  }, [values, submissionId, startedAt, storageKey])

  const setValue = useCallback((path, value) => {
    setValues((v) => setIn(v, path, value))
  }, [])

  async function onSubmit() {
    setSubmitError('')
    const found = validate(schema.fields, values, values, language)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setSubmitError('Please fix the highlighted questions.')
      return
    }

    setSubmitting(true)
    try {
      const data = buildData(schema.fields, values, values)
      const attachments = collectAttachments(data)
      await submitFilledForm({
        id: submissionId,
        form_version_id: version.id,
        data,
        started_at: startedAt ? new Date(startedAt).toISOString() : undefined,
        duration_seconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined,
        user_agent: navigator.userAgent,
        attachments,
      })
      localStorage.removeItem(storageKey)
      setDone(true)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <div className="text-3xl">✓</div>
          <h2 className="text-xl font-semibold">Submission received</h2>
          <p className="text-muted-foreground">Thank you. Your response has been recorded.</p>
          <Button
            onClick={() => {
              setValues({})
              setSubmissionId(crypto.randomUUID())
              setStartedAt(Date.now())
              setErrors({})
              setDone(false)
            }}
          >
            Fill another
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
          <p className="text-sm text-muted-foreground">Version {version.version_no}</p>
        </div>
        {schema.languages?.length > 1 ? (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {schema.languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <Fields
        fields={schema.fields}
        basePath={[]}
        scope={values}
        topValues={values}
        language={language}
        submissionId={submissionId}
        errors={errors}
        setValue={setValue}
      />

      {submitError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={onSubmit} disabled={submitting || !submissionId}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
        <span className="text-xs text-muted-foreground">Draft autosaves as you go.</span>
      </div>
    </div>
  )
}

// Recursive field renderer. `scope` is the data object for this level; `topValues` is the
// full form value tree (used for cross-scope expression references).
function Fields({ fields, basePath, scope, topValues, language, submissionId, errors, setValue }) {
  const context = { ...topValues, ...scope }

  return (
    <div className="space-y-5">
      {fields.map((f) => {
        if (!isRelevant(f.relevant, context)) return null
        const path = [...basePath, f.name]
        const key = path.join('.')

        if (f.type === 'begin_group') {
          return (
            <fieldset key={key} className="space-y-5 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">{labelFor(f, language)}</legend>
              <Fields
                fields={f.children ?? []}
                basePath={basePath}
                scope={scope}
                topValues={topValues}
                language={language}
                submissionId={submissionId}
                errors={errors}
                setValue={setValue}
              />
            </fieldset>
          )
        }

        if (f.type === 'begin_repeat') {
          const instances = Array.isArray(scope[f.name]) ? scope[f.name] : []
          return (
            <fieldset key={key} className="space-y-4 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">{labelFor(f, language)}</legend>
              {instances.map((inst, i) => (
                <div key={i} className="space-y-4 rounded-md bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {labelFor(f, language)} {i + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setValue([...basePath, f.name], instances.filter((_, j) => j !== i))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <Fields
                    fields={f.children ?? []}
                    basePath={[...basePath, f.name, i]}
                    scope={inst}
                    topValues={topValues}
                    language={language}
                    submissionId={submissionId}
                    errors={errors}
                    setValue={setValue}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValue([...basePath, f.name], [...instances, {}])}
              >
                Add {labelFor(f, language)}
              </Button>
            </fieldset>
          )
        }

        const value =
          f.type === 'calculate' ? calculate(f.calculation, context) : scope[f.name]
        return (
          <FieldInput
            key={key}
            field={f}
            value={value}
            onChange={(v) => setValue(path, v)}
            language={language}
            submissionId={submissionId}
            error={errors[key]}
          />
        )
      })}
    </div>
  )
}
