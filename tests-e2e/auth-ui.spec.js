import { test, expect } from '@playwright/test'

// Public auth pages — no login required. Safe to run anywhere (uses a non-existent email so no
// real reset email is sent).
test.describe('auth UI', () => {
  test('login password field has a show/hide toggle', async ({ page }) => {
    await page.goto('/login')
    const pw = page.locator('#password')
    await pw.fill('secret123')
    await expect(pw).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(pw).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(pw).toHaveAttribute('type', 'password')
  })

  test('forgot-password flow returns a generic confirmation', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /forgot password/i }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible()
    await page.getByLabel('Email').fill('nobody-xyz@example.invalid')
    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByText(/reset link is on its way/i)).toBeVisible()
  })
})
