import { expect, test } from 'playwright/test'

test.describe('public smoke', () => {
  test('home renders primary navigation and headline', async ({ page }) => {
    await page.goto('/home')

    await expect(page.getByRole('link', { name: /liveinblack/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /connexion/i })).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
  })

  test('health endpoint responds successfully in CI/dev', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const payload = await response.json()
    expect(payload).toMatchObject({
      ok: true,
      checks: {
        app: 'ok',
      },
    })
  })
})
