import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')


const users = {
  client: 'client@liveinblack.dev',
  organizer: 'organisateur@liveinblack.dev',
  provider: 'prestataire@liveinblack.dev',
  agent: 'agent@liveinblack.dev',
}

async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

const agentSections = [
  { path: '/agent', text: /dashboard|agent|dossiers|signalements/i },
  { path: '/agent/comptes', text: /comptes|utilisateurs|client@liveinblack\.dev/i },
  { path: '/agent/dossiers', text: /candidat|dossier|Sena Events|Yawa/i },
  { path: '/agent/evenements', text: /AFRO NATION LOMÉ|événements/i },
  { path: '/agent/paiements', text: /paiements|payout|boost|remboursements/i },
  { path: '/agent/signalements', text: /signalements|reports|modération/i },
  { path: '/agent/suppressions', text: /suppressions|RGPD|demande/i },
]

test.describe('seeded authenticated journeys', () => {
  test('client can sign in and access profile, tickets and messages', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, users.client)

    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/profil|Ama/i)
    await expect(page.getByRole('main')).toBeVisible()

    await page.goto('/profile/billets', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('main')).toContainText(/AFRO NATION LOMÉ|billet/i, { timeout: 15_000 })

    await page.goto('/messages', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('main')).toContainText(/Avec plaisir|Obsidian|message/i, { timeout: 15_000 })
  })

  test('organizer can access event management, studio and seeded event stats', async ({ page }) => {
    await login(page, users.organizer)

    await page.goto('/my-events')
    await expect(page.locator('main')).toContainText(/AFRO NATION LOMÉ|événement/i)

    await page.goto('/organizer-studio')
    await expect(page.locator('main')).toContainText(/Obsidian Nights|organisateur|studio/i)

    const eventLink = page.getByRole('link', { name: /statistiques/i }).first()
    if (await eventLink.isVisible().catch(() => false)) {
      await eventLink.click()
      await expect(page.locator('main')).toContainText(/statistiques|ventes|billets/i)
    }
  })

  test('provider can access service workspace with catalog and subscription surfaces', async ({ page }) => {
    await login(page, users.provider)

    await page.goto('/offer-services')
    await expect(page.locator('main')).toContainText(/DJ Koffi|Set DJ 3h|prestataire|catalogue/i)
  })

  test('agent can access moderation dashboard and core back-office sections', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, users.agent)

    for (const section of agentSections) {
      await page.goto(section.path, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(new RegExp(section.path.replace('/', '\\/')))
      await expect(page.getByRole('main')).toBeVisible()
    }
  })

  test('authenticated user can sign out and loses access to private routes', async ({ page }) => {
    test.setTimeout(120_000)

    await login(page, users.client)
    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const logoutButton = page.getByRole('main').getByRole('button', { name: /Se déconnecter/i })
    await expect(logoutButton).toBeEnabled()
    await logoutButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /^Déconnecter$/i }).click()
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 })
    await expect
      .poll(async () => {
        const response = await page.request.get('/api/auth/session')
        const session = await response.json()
        return session?.user?.email ?? null
      },
        { timeout: 15_000 }
      )
      .toBe(null)

    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile/)
  })
})
