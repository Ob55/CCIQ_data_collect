import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { listExportableForms, generateExport } from '@/lib/export'
import { useAsync } from '@/lib/use-async'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loading, ErrorState } from '@/components/page-state'

const SELECT = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

// Export builder (§7 screen 5). The SPA has no /api/export route, so it calls generateExport
// in the browser and triggers a client-side download of the returned file body.
export function ExportsPage() {
  const { data: forms, loading, error } = useAsync(() => listExportableForms(), [])

  if (loading) return <Wrap><Loading /></Wrap>
  if (error) return <Wrap><ErrorState message={error} /></Wrap>

  return (
    <Wrap>
      {forms.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No forms available to export.</Card>
      ) : (
        <ExportBuilder forms={forms} />
      )}
    </Wrap>
  )
}

function ExportBuilder({ forms }) {
  const { user } = useAuth()
  const [formId, setFormId] = useState(forms[0]?.id ?? '')
  const [format, setFormat] = useState('xlsx')
  const [headerMode, setHeaderMode] = useState('labels')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null)

  async function handleExport(e) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const out = await generateExport({
        userId: user.id,
        formId,
        format,
        headerMode,
        status,
        from,
        to,
      })
      const blob = new Blob([out.body], { type: out.contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = out.filename
      a.click()
      URL.revokeObjectURL(url)
      setResult(out)
    } catch (e2) {
      setErr(e2?.message || 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Build an export</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleExport} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="form_id">Form</Label>
            <select
              id="form_id"
              name="form_id"
              required
              className={SELECT}
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
            >
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <select
                id="format"
                name="format"
                className={SELECT}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="xlsx">XLSX (repeats as sheets)</option>
                <option value="csv">CSV (main sheet only)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="headers">Headers</Label>
              <select
                id="headers"
                name="headers"
                className={SELECT}
                value={headerMode}
                onChange={(e) => setHeaderMode(e.target.value)}
              >
                <option value="labels">Question labels (reading)</option>
                <option value="names">Variable names (analysis)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className={SELECT}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Any</option>
                <option value="new">New</option>
                <option value="approved">Approved</option>
                <option value="flagged">Flagged</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                name="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                name="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Preparing…' : 'Download export'}
          </Button>

          {err && <ErrorState message={err} />}

          {result && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                Downloaded {result.filename} · {result.rows} row{result.rows === 1 ? '' : 's'}.
              </p>
              {result.truncated && (
                <p className="text-muted-foreground">
                  Row cap reached — some submissions were omitted. Narrow the date range or status
                  and export again.
                </p>
              )}
              {result.repeatsOmitted && (
                <p className="text-muted-foreground">
                  Repeat groups were omitted (CSV holds a single sheet). Use XLSX to include them.
                </p>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function Wrap({ children }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Exports"
        description="Download submissions as XLSX or CSV. Repeat groups become separate sheets (XLSX)."
      />
      {children}
    </div>
  )
}
