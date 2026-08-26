import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const ids = {
  event: '66e200000000000000000103',
  organizer: '66e200000000000000000018',
  clientTicketCode: 'E2E-SCANNER-001',
}

async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

async function api<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init)
      return { status: response.status, body: await response.json() }
    },
    { path, init }
  )
}

test.describe.serial('seeded scanner manual entry', () => {
  test('organizer can scan a ticket code manually and see the already-checked-in state on a replay', async ({ page }) => {
    await login(page, 'organisateur@liveinblack.dev')
    await page.goto(`/scanner/${ids.event}`, { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible()
    const submit = page.getByRole('button', { name: 'Valider' })
    await page.getByLabel('Code du billet').fill(ids.clientTicketCode)
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText('Billet valide')).toBeVisible()
    await expect(page.getByText('Entrée standard')).toBeVisible()
    await page.getByRole('button', { name: 'Scanner un autre billet' }).click()

    const replay = await api<{ ok: boolean; alreadyCheckedIn: boolean; pointAwarded: boolean }>(page, '/api/tickets/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.event, ticketCode: ids.clientTicketCode }),
    })
    expect(replay.status).toBe(200)
    expect(replay.body.alreadyCheckedIn).toBe(true)

    const freshPage = await page.context().newPage()
    const freshSubmit = freshPage.getByRole('button', { name: 'Valider' })
    await login(freshPage, 'organisateur@liveinblack.dev')
    await freshPage.goto(`/scanner/${ids.event}`, { waitUntil: 'networkidle' })
    await freshPage.getByLabel('Code du billet').fill(ids.clientTicketCode)
    await expect(freshSubmit).toBeEnabled()
    await freshSubmit.click()
    await expect(freshPage.getByText('Déjà entré')).toBeVisible()
    await freshPage.close()
  })

  test('client cannot open the scanner gate without a staff role', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')
    await page.goto(`/scanner/${ids.event}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Accès refusé')).toBeVisible()
  })
})
