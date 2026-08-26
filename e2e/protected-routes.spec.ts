import { expect, test } from 'playwright/test'

const protectedRoutes = [
  '/profile',
  '/profile/billets',
  '/profile/parametres',
  '/messages',
  '/notifications',
  '/my-events',
  '/organizer-studio',
  '/offer-services',
  '/my-application',
  '/my-shifts',
  '/agent',
  '/agent/comptes',
  '/agent/dossiers',
  '/agent/evenements',
  '/agent/paiements',
  '/agent/signalements',
  '/agent/suppressions',
  '/scanner/test-event',
  '/on-site-sales/test-event',
]

test.describe('protected routes', () => {
  for (const path of protectedRoutes) {
    test(`${path} redirects anonymous visitors to login with next parameter`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })

      const url = new URL(page.url())
      expect(url.pathname).toBe('/login')
      expect(url.searchParams.get('next')).toBe(path)
      await expect(page.getByRole('heading', { name: /Content de te revoir|Créer un compte/i })).toBeVisible()
    })
  }

  test('protected routes are covered by the e2e list without accidental duplicates', () => {
    expect(new Set(protectedRoutes).size).toBe(protectedRoutes.length)
  })
})
