// Writes the fixture workbooks to tests/fixtures/*.xlsx for manual inspection.
// The unit tests use the in-memory builders directly; these files are for humans.
// Run: node scripts/build-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as XLSX from 'xlsx'
import { fixtures } from '../tests/fixtures/workbooks.js'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'xlsx')
mkdirSync(outDir, { recursive: true })

// The SheetJS ESM (CDN) build doesn't auto-wire fs, so write via buffer ourselves.
for (const [name, build] of Object.entries(fixtures)) {
  const path = join(outDir, `${name}.xlsx`)
  const buf = XLSX.write(build(), { type: 'buffer', bookType: 'xlsx' })
  writeFileSync(path, buf)
  console.log(`wrote ${path}`)
}
