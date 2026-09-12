'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createFormSchema, assignmentsSchema, builderFormSchema } from '@/lib/schemas'
import {
  parseUploadPreview,
  createFormFromUpload,
  createFormFromSchema,
  buildRuntimeSchema,
  addVersionFromUpload,
  deployVersion,
  retireVersion,
  setAssignments,
} from '@/lib/forms'
import { XlsformError } from '@/lib/xlsform/errors'

const MANAGERS = ['admin', 'supervisor']

/** Format any thrown error into a user-facing message with row context when available. */
function toMessage(err) {
  if (err instanceof XlsformError) {
    const where = err.row ? ` (row ${err.row})` : ''
    return `${err.message}${where}`
  }
  return err?.message || 'Something went wrong.'
}

/** Parse an upload and return a preview report — persists nothing (§7). */
export async function parseUploadAction(_prev, formData) {
  await requireRole(MANAGERS)
  try {
    const { schema, warnings, questionCount } = await parseUploadPreview(formData.get('file'))
    return {
      ok: true,
      report: {
        questionCount,
        warnings,
        languages: schema.languages,
        title: schema.settings.form_title ?? '',
      },
    }
  } catch (err) {
    return { ok: false, error: toMessage(err) }
  }
}

/** Confirm: create the form + first draft version, then go to its detail page. */
export async function createFormAction(_prev, formData) {
  const { user } = await requireRole(MANAGERS)
  const parsed = createFormSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  let formId
  try {
    const result = await createFormFromUpload({
      actorId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      file: formData.get('file'),
    })
    formId = result.formId
  } catch (err) {
    return { ok: false, error: toMessage(err) }
  }

  revalidatePath('/forms')
  redirect(`/forms/${formId}`)
}

/**
 * Create a form + first draft version from the from-scratch builder (§5.5).
 * Called directly with a serializable payload (not FormData) from the builder client component.
 * @param {unknown} payload
 * @returns {Promise<{ ok: true, formId: string } | { ok: false, error: string }>}
 */
export async function createBuilderFormAction(payload) {
  const { user } = await requireRole(MANAGERS)
  const parsed = builderFormSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' }
  }
  try {
    const schema = buildRuntimeSchema(parsed.data)
    const { formId } = await createFormFromSchema({
      actorId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      schema,
    })
    revalidatePath('/forms')
    return { ok: true, formId }
  } catch (err) {
    return { ok: false, error: toMessage(err) }
  }
}

/** Add a new draft version to an existing form. */
export async function addVersionAction(_prev, formData) {
  const { user } = await requireRole(MANAGERS)
  const formId = formData.get('form_id')
  try {
    await addVersionFromUpload({ actorId: user.id, formId, file: formData.get('file') })
  } catch (err) {
    return { ok: false, error: toMessage(err) }
  }
  revalidatePath(`/forms/${formId}`)
  return { ok: true }
}

export async function deployAction(formData) {
  const { user } = await requireRole(MANAGERS)
  const versionId = formData.get('version_id')
  const formId = formData.get('form_id')
  await deployVersion({ actorId: user.id, versionId })
  revalidatePath(`/forms/${formId}`)
}

export async function retireAction(formData) {
  const { user } = await requireRole(MANAGERS)
  const versionId = formData.get('version_id')
  const formId = formData.get('form_id')
  await retireVersion({ actorId: user.id, versionId })
  revalidatePath(`/forms/${formId}`)
}

/** Save assignment toggles from the form-detail UI. */
export async function setAssignmentsAction(_prev, formData) {
  const { user } = await requireRole(MANAGERS)
  const formId = formData.get('form_id')
  const parsed = assignmentsSchema.safeParse(JSON.parse(formData.get('entries') ?? '[]'))
  if (!parsed.success) {
    return { ok: false, error: 'Invalid assignment data.' }
  }
  try {
    await setAssignments({ actorId: user.id, formId, entries: parsed.data })
  } catch (err) {
    return { ok: false, error: toMessage(err) }
  }
  revalidatePath(`/forms/${formId}`)
  return { ok: true, savedAt: Date.now() }
}
