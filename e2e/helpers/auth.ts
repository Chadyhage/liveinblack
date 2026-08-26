import { expect, type Page } from 'playwright/test'

export const seededPassword = 'DevTest1234!'

async function requestWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastError
}

export async function loginSeededUser(page: Page, email: string, password = seededPassword) {
  await page.context().clearCookies()
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `127.0.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 200) + 20}` })

  const csrfResponse = await requestWithRetry(() => page.request.get('/api/auth/csrf'))
  expect(csrfResponse.ok()).toBe(true)
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }

  const response = await requestWithRetry(() =>
    page.request.post('/api/auth/callback/credentials', {
      form: {
        csrfToken,
        email,
        password,
        callbackUrl: '/profile',
        json: 'true',
      },
    })
  )
  expect(response.status()).toBeGreaterThanOrEqual(200)
  expect(response.status()).toBeLessThan(400)

  await expect
    .poll(
      async () => {
        const sessionResponse = await page.request.get('/api/auth/session')
        const session = (await sessionResponse.json()) as { user?: { email?: string | null } } | null
        return session?.user?.email ?? null
      },
      { timeout: 15_000 }
    )
    .toBe(email)

  await page.goto('/profile', { waitUntil: 'domcontentloaded' })
}

export async function dismissCookieBanner(page: Page) {
  await page.getByRole('button', { name: /Essentiels uniquement/i }).click({ timeout: 2_000 }).catch(() => {})
}
