export const SEED_PASSWORD = 'CleanCook!2026'

/** Log in through the real login form and land on the dashboard. */
export async function login(page, email) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', SEED_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
}
