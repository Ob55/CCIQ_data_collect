import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Read-only render check for the redesigned inner pages + form builder interactivity.
// Does NOT submit the builder, so it writes no data — safe against any environment.
test.describe('redesigned inner pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin@cleancook.test')
  })

  test('dashboard shows stat cards and quick actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
    await expect(page.getByText('Forms', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Awaiting review')).toBeVisible()
    await expect(page.getByRole('heading', { name: /quick actions/i })).toBeVisible()
  })

  test('my forms renders a header', async ({ page }) => {
    await page.goto('/my-forms')
    await expect(page.getByRole('heading', { name: 'My Forms' })).toBeVisible()
  })

  test('form builder is interactive', async ({ page }) => {
    test.setTimeout(120_000) // first-hit dev compilation of this route can be slow
    await page.goto('/forms/new')
    await expect(page.getByRole('heading', { name: 'New form' })).toBeVisible()
    // Mode cards
    await expect(page.getByText('Build from scratch')).toBeVisible()
    await expect(page.getByText('Upload XLSForm')).toBeVisible()

    // Add a question, then switch it to a choice type and reveal the options editor.
    // Exact name so we don't match the "Build from scratch — Add questions…" mode card.
    await page.getByRole('button', { name: 'Add question', exact: true }).click()
    await page.getByPlaceholder(/question label/i).fill('Owns a stove?')
    await page.getByLabel('Question type').selectOption('select_one')
    await expect(page.getByText('Options')).toBeVisible()
    await expect(page.getByRole('button', { name: /add option/i })).toBeVisible()
  })
})
