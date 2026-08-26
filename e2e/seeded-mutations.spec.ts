import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const ids = {
  event: '66e200000000000000000101',
  checkinTicketCode: 'E2E-CHECKIN-001',
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

test.describe.serial('seeded authenticated mutations', () => {
  test('client can mark and unmark event interest', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const marked = await api<{ ok: boolean; interested: boolean }>(page, `/api/events/${ids.event}/interest`, { method: 'POST' })
    expect(marked).toMatchObject({ status: 200, body: { ok: true, interested: true } })

    const read = await api<{ ok: boolean; interested: boolean }>(page, `/api/events/${ids.event}/interest`)
    expect(read).toMatchObject({ status: 200, body: { ok: true, interested: true } })

    const unmarked = await api<{ ok: boolean; interested: boolean }>(page, `/api/events/${ids.event}/interest`, { method: 'DELETE' })
    expect(unmarked).toMatchObject({ status: 200, body: { ok: true, interested: false } })
  })

  test('client can send a text message in the seeded conversation', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const createdGroup = await api<{ ok: boolean; conversation: { id: string } }>(page, '/api/conversations/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Mutations E2E ${Date.now()}`, memberUserIds: ['66e200000000000000000007'] }),
    })
    expect(createdGroup.status).toBe(200)

    const content = `Message E2E ${Date.now()}`
    const sent = await api<{ ok: boolean; message: { content: string; senderName: string } }>(
      page,
      `/api/conversations/${createdGroup.body.conversation.id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', content }),
      }
    )
    expect(sent.status).toBe(200)
    expect(sent.body.ok).toBe(true)
    expect(sent.body.message.content).toBe(content)

    const messages = await api<{ ok: boolean; messages: Array<{ content: string }> }>(page, `/api/conversations/${createdGroup.body.conversation.id}/messages?limit=5`)
    expect(messages.status).toBe(200)
    expect(messages.body.messages.some((message) => message.content === content)).toBe(true)
  })

  test('organizer can check in the seeded ticket exactly once', async ({ page }) => {
    await login(page, 'organisateur@liveinblack.dev')

    const first = await api<{ ok: boolean; alreadyCheckedIn: boolean; ticket: { ticketCode: string } }>(page, '/api/tickets/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: ids.checkinTicketCode, eventId: ids.event }),
    })
    expect(first).toMatchObject({ status: 200, body: { ok: true, alreadyCheckedIn: false } })
    expect(first.body.ticket.ticketCode).toBe(ids.checkinTicketCode)

    const second = await api<{ ok: boolean; alreadyCheckedIn: boolean }>(page, '/api/tickets/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: ids.checkinTicketCode, eventId: ids.event }),
    })
    expect(second).toMatchObject({ status: 200, body: { ok: true, alreadyCheckedIn: true } })
  })

  test('client can update profile name through the profile API', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const response = await api<{ ok: boolean; firstName: string; lastName: string }>(page, '/api/profil/nom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ama', lastName: 'E2E' }),
    })
    expect(response).toMatchObject({ status: 200, body: { ok: true, firstName: 'Ama', lastName: 'E2E' } })

    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ama E2E')
  })

  test('agent can read dashboard APIs with seeded data', async ({ page }) => {
    await login(page, 'agent@liveinblack.dev')

    const dashboard = await api<{ ok: boolean }>(page, '/api/agent/dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.body.ok).toBe(true)

    const applications = await api<{ ok: boolean; applications: Array<{ type: string }> }>(page, '/api/agent/applications')
    expect(applications.status).toBe(200)
    expect(applications.body.ok).toBe(true)
    expect(applications.body.applications.some((application) => application.type === 'organisateur')).toBe(true)
    expect(applications.body.applications.some((application) => application.type === 'prestataire')).toBe(true)
  })
})
