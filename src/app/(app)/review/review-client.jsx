'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { loadReviewItemAction, reviewAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

export function ReviewClient({ queue, submitters, filters }) {
  const [statuses, setStatuses] = useState({}) // local status overrides after actions
  const [index, setIndex] = useState(0)
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const commentRef = useRef(null)

  const current = queue[index] ?? null

  const load = useCallback(async (id) => {
    setLoading(true)
    setActionError('')
    const res = await loadReviewItemAction(id)
    setItem(res.ok ? res.item : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (current) {
      setComment('')
      load(current.id)
    } else {
      setItem(null)
    }
  }, [current, load])

  const go = useCallback(
    (delta) => setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(queue.length - 1, 0))),
    [queue.length]
  )

  const doReview = useCallback(
    async (action) => {
      if (!current || !item?.canReview || busy) return
      if (action !== 'approve' && !comment.trim()) {
        setActionError('A comment is required to flag or reject.')
        commentRef.current?.focus()
        return
      }
      setBusy(true)
      setActionError('')
      const fd = new FormData()
      fd.set('submission_id', current.id)
      fd.set('action', action)
      fd.set('comment', comment)
      const res = await reviewAction(null, fd)
      setBusy(false)
      if (!res.ok) {
        setActionError(res.error)
        return
      }
      const nextStatus = action === 'approve' ? 'approved' : action === 'flag' ? 'flagged' : 'rejected'
      setStatuses((s) => ({ ...s, [current.id]: nextStatus }))
      if (index < queue.length - 1) go(1)
    },
    [current, item, comment, busy, index, queue.length, go]
  )

  // Keyboard shortcuts (§8). Letter keys are ignored while typing in a field.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'j' && !typing) go(1)
      else if (e.key === 'k' && !typing) go(-1)
      else if (e.key === 'a' && !typing) doReview('approve')
      else if (e.key === 'f' && !typing) {
        e.preventDefault()
        if (comment.trim()) doReview('flag')
        else commentRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, doReview, comment])

  return (
    <div className="space-y-4">
      <FilterBar submitters={submitters} filters={filters} />

      {queue.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nothing to review with these filters.
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={index === 0}>
                ← Prev (K)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => go(1)}
                disabled={index >= queue.length - 1}
              >
                Next (J) →
              </Button>
            </div>
            <span className="text-muted-foreground">
              {index + 1} of {queue.length}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Left: the submission rendered against its schema */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{item?.meta?.form_title ?? current.form_title}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading || !item ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <SubmissionView rows={item.rows} />
                )}
              </CardContent>
            </Card>

            {/* Right: metadata + actions */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Meta label="Status">
                    <Badge variant={statuses[current.id] ?? current.status}>
                      {statuses[current.id] ?? current.status}
                    </Badge>
                  </Meta>
                  <Meta label="Enumerator">{current.submitter_name}</Meta>
                  <Meta label="Role">{current.submitted_by_role}</Meta>
                  <Meta label="Submitted">{new Date(current.submitted_at).toLocaleString()}</Meta>
                  <Meta label="Duration">
                    {current.duration_seconds != null ? `${current.duration_seconds}s` : '—'}
                  </Meta>
                  <Meta label="Version">v{current.version_no}</Meta>
                  {item?.meta?.geo ? (
                    <Meta label="GPS">
                      {item.meta.geo.lat.toFixed(5)}, {item.meta.geo.lng.toFixed(5)}
                    </Meta>
                  ) : null}

                  {current.hints?.length ? (
                    <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                      {current.hints.map((h, i) => (
                        <div key={i}>⚠ {h}</div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Action</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item?.isOwn ? (
                    <p className="text-sm text-muted-foreground">
                      This is your own submission — it must be reviewed by someone else.
                    </p>
                  ) : !item?.canReview ? (
                    <p className="text-sm text-muted-foreground">
                      You don&apos;t have review rights on this form.
                    </p>
                  ) : (
                    <>
                      <Textarea
                        ref={commentRef}
                        placeholder="Comment (required to flag or reject)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      {actionError ? (
                        <p role="alert" className="text-sm text-destructive">
                          {actionError}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => doReview('approve')} disabled={busy}>
                          Approve (A)
                        </Button>
                        <Button variant="outline" onClick={() => doReview('flag')} disabled={busy}>
                          Flag (F)
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => doReview('reject')}
                          disabled={busy}
                        >
                          Reject
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Meta({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function SubmissionView({ rows }) {
  return <div className="space-y-4">{rows.map((r, i) => <Row key={i} row={r} />)}</div>
}

function Row({ row }) {
  if (row.kind === 'group') {
    return (
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-semibold">{row.label}</legend>
        {row.children.map((c, i) => (
          <Row key={i} row={c} />
        ))}
      </fieldset>
    )
  }
  if (row.kind === 'repeat') {
    return (
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-semibold">{row.label}</legend>
        {row.instances.length === 0 ? (
          <p className="text-xs text-muted-foreground">No entries.</p>
        ) : (
          row.instances.map((inst, i) => (
            <div key={i} className="space-y-2 rounded-md bg-muted/40 p-2">
              <div className="text-xs font-medium text-muted-foreground">
                {row.label} {i + 1}
              </div>
              {inst.map((c, j) => (
                <Row key={j} row={c} />
              ))}
            </div>
          ))
        )}
      </fieldset>
    )
  }
  // leaf field
  return (
    <div className="grid grid-cols-3 gap-3 border-b pb-2 text-sm last:border-0">
      <div className="text-muted-foreground">{row.label}</div>
      <div className="col-span-2">
        {row.value?.photos ? (
          <div className="flex flex-wrap gap-2">
            {row.value.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`${row.label} ${i + 1}`}
                className="max-h-48 rounded-md border"
              />
            ))}
          </div>
        ) : row.value?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.value.photo} alt={row.label} className="max-h-48 rounded-md border" />
        ) : row.value?.mapUrl ? (
          <a href={row.value.mapUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            {row.value.text}
          </a>
        ) : (
          <span className="font-medium">{row.value?.text ?? '—'}</span>
        )}
      </div>
    </div>
  )
}

function FilterBar({ submitters, filters }) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <Field label="Status">
        <select name="status" defaultValue={filters.status} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any</option>
          <option value="new">New</option>
          <option value="approved">Approved</option>
          <option value="flagged">Flagged</option>
          <option value="rejected">Rejected</option>
        </select>
      </Field>
      <Field label="Enumerator">
        <select name="submittedBy" defaultValue={filters.submittedBy} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Anyone</option>
          {submitters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name || s.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Role">
        <select name="role" defaultValue={filters.role} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any</option>
          <option value="enumerator">Enumerator</option>
          <option value="supervisor">Supervisor</option>
        </select>
      </Field>
      <Field label="From">
        <input type="date" name="from" defaultValue={filters.from} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
      </Field>
      <Field label="To">
        <input type="date" name="to" defaultValue={filters.to} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
      </Field>
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}
