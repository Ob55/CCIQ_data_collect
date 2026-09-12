import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  getFormDetail,
  listAssignableUsers,
  setAssignments,
  addVersionFromUpload,
  deployVersion,
  retireVersion,
} from '@/lib/forms'
import { useAsync } from '@/lib/use-async'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loading, ErrorState } from '@/components/page-state'

const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', enumerator: 'Enumerator' }

function countQuestions(fields) {
  let n = 0
  for (const f of fields ?? []) {
    if (f.children) n += countQuestions(f.children)
    else n++
  }
  return n
}

export function FormDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: detail, loading, error, reload } = useAsync(() => getFormDetail(id), [id])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  if (!detail) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        This form doesn&apos;t exist or you don&apos;t have access to it.
      </Card>
    )
  }

  const { form, versions, assignments } = detail
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
                      <VersionActions version={v} actorId={user.id} onDone={reload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddVersion formId={form.id} actorId={user.id} onDone={reload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Assignments
            formId={form.id}
            actorId={user.id}
            users={detail.users ?? null}
            current={assignments}
            onDone={reload}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/** Deploy/retire actions for a single version row. */
function VersionActions({ version, actorId, onDone }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setPending(true)
    setError(null)
    try {
      await fn({ actorId, versionId: version.id })
      onDone()
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
      setPending(false)
    }
  }

  if (version.status === 'draft') {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <Button size="sm" disabled={pending} onClick={() => run(deployVersion)}>
          {pending ? 'Deploying…' : 'Deploy'}
        </Button>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  if (version.status === 'deployed') {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(retireVersion)}>
          {pending ? 'Retiring…' : 'Retire'}
        </Button>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  return <span className="text-xs text-muted-foreground">—</span>
}

/** Upload a new draft version of an existing form (§5.5). */
function AddVersion({ formId, actorId, onDone }) {
  const [file, setFile] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    if (!file) return
    setPending(true)
    setError(null)
    try {
      await addVersionFromUpload({ actorId, formId, file })
      e.target.reset()
      setFile(null)
      onDone()
    } catch (err) {
      setError(err?.message || 'Could not add the version.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <input
        type="file"
        name="file"
        accept=".xlsx"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload new version'}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </form>
  )
}

/** Shows the public fill link and a copy button. Origin is resolved on the client. */
function CopyLink({ slug }) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => setOrigin(window.location.origin), [])
  const url = `${origin}/f/${slug}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

/**
 * Assignment editor (§7): per-user can_fill / can_review toggles.
 * The Next.js version received `users` from the server component. Here we load them on the
 * client via listAssignableUsers() when not provided.
 */
function Assignments({ formId, actorId, users: usersProp, current, onDone }) {
  const { data: loadedUsers, loading, error } = useAsync(
    () => (usersProp ? Promise.resolve(usersProp) : listAssignableUsers()),
    [formId]
  )
  const users = usersProp ?? loadedUsers

  if (loading) return <Loading label="Loading users…" />
  if (error) return <ErrorState message={error} />
  if (!users) return null

  return <AssignmentsEditor formId={formId} actorId={actorId} users={users} current={current} onDone={onDone} />
}

function AssignmentsEditor({ formId, actorId, users, current, onDone }) {
  const initial = {}
  for (const u of users) {
    const a = current.find((c) => c.user_id === u.id)
    initial[u.id] = { can_fill: a?.can_fill ?? false, can_review: a?.can_review ?? false }
  }
  const [rows, setRows] = useState(initial)
  const [pending, setPending] = useState(false)
  const [state, setState] = useState(null)

  function toggle(userId, key) {
    setRows((r) => ({ ...r, [userId]: { ...r[userId], [key]: !r[userId][key] } }))
  }

  const entries = users.map((u) => ({ user_id: u.id, ...rows[u.id] }))

  async function onSubmit(e) {
    e.preventDefault()
    setPending(true)
    setState(null)
    try {
      await setAssignments({ actorId, formId, entries })
      setState({ ok: true })
      onDone()
    } catch (err) {
      setState({ ok: false, error: err?.message || 'Could not save assignments.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-center font-medium">Can fill</th>
              <th className="px-4 py-2 text-center font-medium">Can review</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</div>
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={rows[u.id].can_fill}
                    onChange={() => toggle(u.id, 'can_fill')}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={rows[u.id].can_review}
                    // Enumerators never review (§3); keep the box disabled for them.
                    disabled={u.role === 'enumerator'}
                    onChange={() => toggle(u.id, 'can_review')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save assignments'}
        </Button>
        {state?.ok ? <span className="text-sm text-green-700">Saved.</span> : null}
        {state && !state.ok ? (
          <span role="alert" className="text-sm text-destructive">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  )
}
