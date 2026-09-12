'use client'

import { useState, useRef, useActionState } from 'react'
import { parseUploadAction, createFormAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Two-step flow (PRD §7): parse-and-report first, then confirm to create a draft.
export function UploadForm() {
  const [file, setFile] = useState(null)
  const [parseState, parse, parsing] = useActionState(parseUploadAction, null)
  const [createState, create, creating] = useActionState(createFormAction, null)
  const inputRef = useRef(null)

  const report = parseState?.ok ? parseState.report : null

  function onParse(formData) {
    const f = formData.get('file')
    setFile(f && f.size > 0 ? f : null)
    return parse(formData)
  }

  // Re-attach the chosen file to the confirm submission (it isn't kept across actions).
  function onCreate(formData) {
    if (file) formData.set('file', file)
    return create(formData)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a file</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={onParse} className="space-y-4">
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

          {parseState && !parseState.ok ? (
            <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {parseState.error}
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

            <form action={onCreate} className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Form title</Label>
                <Input id="title" name="title" defaultValue={report.title} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" name="description" />
              </div>
              {createState && !createState.ok ? (
                <p role="alert" className="text-sm text-destructive">
                  {createState.error}
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
