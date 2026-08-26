import { expect, test } from 'playwright/test'

const publicPages = [
  { path: '/home', title: /LIVEINBLACK/i, heading: /meilleures soirées|portée de main/i },
  { path: '/events', title: /Événements/i, heading: /prochaine expérience/i },
  { path: '/organizers', title: /Organisateurs/i, heading: /créent l’émotion/i },
  { path: '/providers', title: /Prestataires/i, heading: /talents/i },
  { path: '/about', title: /C'est quoi LIVEINBLACK/i, heading: /Toute la nuit/i },
  { path: '/blog', title: /Blog/i, heading: /idées/i },
  { path: '/contact', title: /Contact/i, heading: /^Contact$/i },
  { path: '/login', title: /Connexion|Inscription/i, heading: /Content de te revoir|Créer un compte/i },
  { path: '/organizer-signup', title: /organisateur/i, heading: /Compte Organisateur/i },
  { path: '/provider-signup', title: /prestataire/i, heading: /Compte Prestataire/i },
  { path: '/privacy', title: /confidentialité/i, heading: /Politique de confidentialité/i },
  { path: '/terms', title: /Conditions/i, heading: /Conditions Générales/i },
  { path: '/cookies', title: /cookies/i, heading: /Politique de cookies/i },
  { path: '/legal-notice', title: /Mentions légales/i, heading: /Mentions légales/i },
]

test.describe('public website', () => {
  for (const publicPage of publicPages) {
    test(`${publicPage.path} renders with the shared navigation`, async ({ page }) => {
      await page.goto(publicPage.path, { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle(publicPage.title)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByRole('banner').getByRole('link', { name: /LIVEINBLACK/i }).first()).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(publicPage.heading)
    })
  }

  test('all core public pages load without browser page errors', async ({ page }) => {
    test.setTimeout(60_000)

    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (const publicPage of publicPages) {
      await page.goto(publicPage.path, { waitUntil: 'domcontentloaded' })
    }

    expect(pageErrors).toEqual([])
  })

  test('desktop navigation links move between public surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/home')

    const nav = page.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page')

    await nav.getByRole('link', { name: 'Événements' }).click()
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByRole('heading', { name: /prochaine expérience/i })).toBeVisible()

    await nav.getByRole('link', { name: 'Prestataires' }).click()
    await expect(page).toHaveURL(/\/providers$/)
    await expect(page.getByRole('heading', { name: /talents/i })).toBeVisible()

    await nav.getByRole('link', { name: 'Organisateurs' }).click()
    await expect(page).toHaveURL(/\/organizers$/)
    await expect(page.getByRole('heading', { name: /créent l’émotion/i })).toBeVisible()
  })

  test('mobile menu opens, navigates, and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/home')

    const menuButton = page.getByRole('button', { name: /ouvrir le menu/i })
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    const closeButton = page.getByRole('button', { name: /fermer le menu/i })
    for (let attempt = 0; attempt < 3 && !(await closeButton.isVisible().catch(() => false)); attempt += 1) {
      await menuButton.click()
      await closeButton.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
    }
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true')

    const mobileNav = page.getByRole('navigation', { name: 'Navigation mobile' })
    await expect(mobileNav.getByRole('link', { name: 'Événements' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /ouvrir le menu/i })).toHaveAttribute('aria-expanded', 'false')

    for (let attempt = 0; attempt < 3 && !(await mobileNav.isVisible().catch(() => false)); attempt += 1) {
      await page.getByRole('button', { name: /ouvrir le menu/i }).click()
      await mobileNav.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
    }
    await mobileNav.getByRole('link', { name: 'Prestataires' }).click()
    await expect(page).toHaveURL(/\/providers$/)
    await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeHidden()
  })
})
