import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getFormDetail, listAssignableUsers } from '@/lib/forms'
import { deployAction, retireAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CopyLink } from './copy-link'
import { AddVersion } from './add-version'
import { Assignments } from './assignments'

export const metadata = { title: 'Form — CleanCook' }

function countQuestions(fields) {
  let n = 0
  for (const f of fields ?? []) {
    if (f.children) n += countQuestions(f.children)
    else n++
  }
  return n
}

export default async function FormDetailPage({ params }) {
  await requireRole(['admin', 'supervisor'])
  const { id } = await params
  const detail = await getFormDetail(id)
  if (!detail) notFound()

  const { form, versions, assignments } = detail
  const users = await listAssignableUsers()
  const hasDeployed = versions.some((v) => v.status === 'deployed')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
        {form.description ? <p className="text-muted-foreground">{form.description}</p> : null}
      </div>

      {hasDeployed ? (
        <Card>
          <CardHeader>
            <CardTitle>Shareable link</CardTitle>
          </CardHeader>
          <CardContent>
            <CopyLink slug={form.slug} />
            <p className="mt-2 text-xs text-muted-foreground">
              Assigned enumerators with “can fill” open this link to complete the form.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Version</th>
                  <th className="px-4 py-2 text-left font-medium">Questions</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-medium">v{v.version_no}</td>
                    <td className="px-4 py-2">{countQuestions(v.schema?.fields)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={v.status}>{v.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {v.status === 'draft' ? (
                        <form action={deployAction} className="inline">
                          <input type="hidden" name="version_id" value={v.id} />
                          <input type="hidden" name="form_id" value={form.id} />
                          <Button type="submit" size="sm">
                            Deploy
                          </Button>
                        </form>
                      ) : v.status === 'deployed' ? (
                        <form action={retireAction} className="inline">
                          <input type="hidden" name="version_id" value={v.id} />
                          <input type="hidden" name="form_id" value={form.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Retire
                          </Button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddVersion formId={form.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Assignments formId={form.id} users={users} current={assignments} />
        </CardContent>
      </Card>
    </div>
  )
}
