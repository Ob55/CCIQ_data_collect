'use client'

import { useState } from 'react'
import { PencilRuler, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormBuilder } from './form-builder'
import { UploadForm } from './upload-form'

const MODES = [
  { key: 'build', label: 'Build from scratch', icon: PencilRuler, hint: 'Add questions one by one — no spreadsheet needed.' },
  { key: 'upload', label: 'Upload XLSForm', icon: Upload, hint: 'Already have an .xlsx? Import it with a parse report.' },
]

/** Lets a manager create a form either with the from-scratch builder or an XLSForm upload (§5.5). */
export function CreateForm() {
  const [mode, setMode] = useState('build')

  return (
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
  )
}
