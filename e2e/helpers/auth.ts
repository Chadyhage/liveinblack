import { expect, type Page } from 'playwright/test'
import { dashboardHrefForRole } from '@/lib/shared/dashboardRoutes'

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
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async ({ email, password }) => {
    const origin = window.location.origin
    const csrfResponse = await fetch(`${origin}/api/auth/csrf`, { credentials: 'include' })
    const csrfData = (await csrfResponse.json()) as { csrfToken?: string }
    const csrfToken = csrfData.csrfToken
    if (!csrfToken) throw new Error('csrf_token_missing')
    const form = new URLSearchParams()
    form.set('csrfToken', csrfToken)
    form.set('email', email)
    form.set('password', password)
    form.set('callbackUrl', '/profile')
    await fetch(`${origin}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'include',
      redirect: 'manual',
    })
  }, { email, password })

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies()
        const sessionCookie = cookies.find((cookie) => cookie.name.includes('authjs.session-token') || cookie.name.includes('__Secure-authjs.session-token'))
        return sessionCookie?.value ? 'present' : null
      },
      { timeout: 15_000 }
    )
    .toBe('present')

  const role = email === 'agent@liveinblack.dev' ? 'agent' : email.includes('prestataire') ? 'prestataire' : email.includes('organisateur') ? 'organisateur' : 'client'
  await page.goto(dashboardHrefForRole(role), { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/(profile|organizer-studio|offer-services|agent)(\/|$)/)
}

export async function dismissCookieBanner(page: Page) {
  await page.getByRole('button', { name: /Essentiels uniquement/i }).click({ timeout: 2_000 }).catch(() => {})
}
