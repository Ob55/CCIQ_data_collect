import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Full write happy-path (PRD §12). WRITES DATA, so it is skipped unless E2E_ALLOW_WRITES=1,
// and must only ever run against local/staging — never production data (PRD §4.2).
test.describe('happy path: upload → deploy → assign → fill → review → export', () => {
  test.skip(
    !process.env.E2E_ALLOW_WRITES,
    'Set E2E_ALLOW_WRITES=1 to run against a NON-production database.'
  )

  const dir = path.dirname(fileURLToPath(import.meta.url))
  const fixture = path.join(dir, '..', 'tests', 'fixtures', 'xlsx', 'simple.xlsx')

  test('admin uploads, deploys, assigns self, fills, and exports', async ({ page }) => {
    await login(page, 'admin@cleancook.test')

    // Upload + parse report + create draft.
    await page.goto('/forms/new')
    await page.setInputFiles('input[type="file"]', fixture)
    await page.getByRole('button', { name: /parse & preview/i }).click()
    await expect(page.getByText(/Parse report/i)).toBeVisible()
    await page.getByRole('button', { name: /create draft form/i }).click()

    // On the form detail page: deploy the draft.
    await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+$/)
    await page.getByRole('button', { name: 'Deploy' }).first().click()
    await expect(page.getByText('deployed').first()).toBeVisible()

    // Assign self can_fill and save.
    const selfRow = page.locator('tr', { hasText: 'admin@cleancook.test' })
    await selfRow.locator('input[type="checkbox"]').first().check()
    await page.getByRole('button', { name: /save assignments/i }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    // Fill the form via My Forms.
    await page.getByRole('link', { name: 'My Forms' }).click()
    await page.getByRole('link', { name: /open form/i }).first().click()
    await page.getByLabel(/what is your name/i).fill('E2E Tester')
    // owns_stove is required select_one — pick the first radio.
    await page.locator('input[type="radio"]').first().check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/submission received/i)).toBeVisible()
  })
})
