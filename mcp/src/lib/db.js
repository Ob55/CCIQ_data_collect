// @ts-check
// Small shared query helpers used by more than one tool.

/**
 * Resolve a form by slug or id. Throws a clear error if neither is given or none matches.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ slug?: string, formId?: string }} sel
 * @returns {Promise<{ id: string, title: string, slug: string, description: string|null }>}
 */
export async function resolveForm(supabase, { slug, formId }) {
  if (!slug && !formId) throw new Error('Provide either `slug` or `formId`.')
  let q = supabase.from('forms').select('id, title, slug, description')
  q = formId ? q.eq('id', formId) : q.eq('slug', slug)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`Form not found for ${formId ? `id ${formId}` : `slug "${slug}"`}.`)
  return data
}

/**
 * All versions for a form, ordered oldest-first.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} formId
 */
export async function listVersions(supabase, formId) {
  const { data, error } = await supabase
    .from('form_versions')
    .select('id, version_no, status, schema, deployed_at')
    .eq('form_id', formId)
    .order('version_no', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** The active language for a schema, falling back to 'default'. */
export function schemaLang(schema) {
  return schema?.languages?.[0] || schema?.settings?.default_language || 'default'
}
