// @ts-check
import { z } from 'zod'
import { resolveForm, listVersions, schemaLang } from '../lib/db.js'
import { flattenSchema } from '../lib/schema.js'

export default {
  name: 'get_form_schema',
  description:
    'Get the questions for a form version: name, label, type, and choice options for select ' +
    'questions. Repeat groups are listed separately. Defaults to the latest deployed version.',
  inputSchema: {
    slug: z.string().optional().describe('Form slug (from list_forms).'),
    formId: z.string().uuid().optional().describe('Form id (alternative to slug).'),
    versionNo: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific version number; defaults to latest deployed, else highest.'),
  },
  /** @param {{ slug?: string, formId?: string, versionNo?: number }} args */
  async handler({ slug, formId, versionNo }, { supabase }) {
    const form = await resolveForm(supabase, { slug, formId })
    const versions = await listVersions(supabase, form.id)
    if (versions.length === 0) throw new Error('This form has no versions.')

    let version
    if (versionNo != null) {
      version = versions.find((v) => v.version_no === versionNo)
      if (!version) throw new Error(`Version ${versionNo} not found for form "${form.slug}".`)
    } else {
      const deployed = versions.filter((v) => v.status === 'deployed')
      version = (deployed.length ? deployed : versions).at(-1)
    }

    const lang = schemaLang(version.schema)
    const { main, repeats } = flattenSchema(version.schema, lang)

    return {
      form: { id: form.id, title: form.title, slug: form.slug },
      version_no: version.version_no,
      status: version.status,
      languages: version.schema?.languages ?? [],
      language: lang,
      questions: main,
      repeats,
    }
  },
}
