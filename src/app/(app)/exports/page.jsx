import { requireRole } from '@/lib/auth'
import { listExportableForms } from '@/lib/export'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Exports — CleanCook' }

const SELECT = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

// Export builder (§7 screen 5). Native GET form → /api/export streams the file download.
export default async function ExportsPage() {
  await requireRole(['admin', 'supervisor'])
  const forms = await listExportableForms()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Exports"
        description="Download submissions as XLSX or CSV. Repeat groups become separate sheets (XLSX)."
      />

      {forms.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No forms available to export.</Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Build an export</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/api/export" method="GET" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="form_id">Form</Label>
                <select id="form_id" name="form_id" required className={SELECT}>
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
                  <select id="format" name="format" className={SELECT} defaultValue="xlsx">
                    <option value="xlsx">XLSX (repeats as sheets)</option>
                    <option value="csv">CSV (main sheet only)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headers">Headers</Label>
                  <select id="headers" name="headers" className={SELECT} defaultValue="labels">
                    <option value="labels">Question labels (reading)</option>
                    <option value="names">Variable names (analysis)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select id="status" name="status" className={SELECT} defaultValue="">
                    <option value="">Any</option>
                    <option value="new">New</option>
                    <option value="approved">Approved</option>
                    <option value="flagged">Flagged</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from">From</Label>
                  <Input id="from" name="from" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to">To</Label>
                  <Input id="to" name="to" type="date" />
                </div>
              </div>

              <Button type="submit">Download export</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
