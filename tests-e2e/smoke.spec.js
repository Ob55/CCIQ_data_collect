import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Read-only smoke: safe to run against any environment. Verifies auth + role-gated nav.
test.describe('auth and role-gated navigation', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin sees management navigation', async ({ page }) => {
    await login(page, 'admin@cleancook.test')
    // Scope to the sidebar nav — the dashboard body may link to the same routes.
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'Forms', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Review' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Audit' })).toBeVisible()
  })

  test('enumerator does NOT see management navigation', async ({ page }) => {
    await login(page, 'enum1@cleancook.test')
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'My Forms' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Review' })).toHaveCount(0)
  })
})
