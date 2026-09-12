import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Verifies migration 0005: a supervisor now sees the review queue and all submissions like an
// admin (previously blank unless explicitly assigned can_review). Requires at least one
// submission to exist in the environment.
test.describe('supervisor review + submissions visibility', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'supervisor@cleancook.test')
  })

  test('review queue is populated, not the empty state', async ({ page }) => {
    await page.goto('/review')
    await expect(page.getByText('Nothing to review with these filters.')).toHaveCount(0)
    await expect(page.getByText(/\d+ of \d+/)).toBeVisible()
  })

  test('submissions page shows the grouped all-submissions view', async ({ page }) => {
    await page.goto('/my-submissions')
    await expect(page.getByRole('heading', { name: 'Submissions' })).toBeVisible()
    await expect(page.getByText('Total submissions')).toBeVisible()
  })
})
