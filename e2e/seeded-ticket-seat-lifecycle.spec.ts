import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const seatCodes = {
  acceptRevoke: 'E2E-TABLE-001',
  decline: 'E2E-TABLE-ACCEPT-REVOKE',
  leave: 'E2E-TABLE-DECLINE',
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

async function inviteSeat(page: Page, ticketCode: string) {
  const invited = await api<{ ok: boolean; invitation?: { id: string; ticketCode: string; targetEmail: string; status: string }; error?: string }>(page, '/api/tickets/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketCode, targetEmail: 'invitee@liveinblack.dev' }),
  })
  if (invited.status === 409 && invited.body.error === 'invitation_already_pending') {
    const outgoing = await api<{ ok: boolean; invitations: Array<{ id: string; ticketCode: string; targetEmail: string; status: string }> }>(
      page,
      `/api/tickets/invitations/outgoing?ticketCodes=${ticketCode}`
    )
    const pending = outgoing.body.invitations.find((item) => item.ticketCode === ticketCode && item.status === 'pending')
    expect(pending).toBeTruthy()
    return pending!.id
  }
  expect(invited).toMatchObject({
    status: 200,
    body: { ok: true, invitation: { ticketCode, targetEmail: 'invitee@liveinblack.dev', status: 'pending' } },
  })
  return invited.body.invitation!.id
}

async function getTicketToken(page: Page, ticketCode: string) {
  const wallet = await api<{
    ok: boolean
    groups: Array<{ myTickets: Array<{ ticketCode: string; ticketToken: string }>; hostedSeats: Array<{ ticketCode: string; ticketToken: string }> }>
  }>(page, '/api/tickets/mine')
  expect(wallet.status).toBe(200)

  const tickets = wallet.body.groups.flatMap((group) => [...group.myTickets, ...group.hostedSeats])
  const ticket = tickets.find((entry) => entry.ticketCode === ticketCode)
  expect(ticket?.ticketToken).toBeTruthy()
  return ticket!.ticketToken
}

test.describe.serial('seeded table seat lifecycle', () => {
  test('invitee can accept a table seat and host can revoke it, invalidating the old ticket token', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')
    const invitationId = await inviteSeat(page, seatCodes.acceptRevoke)

    const outgoing = await api<{ ok: boolean; invitations: Array<{ id: string; ticketCode: string; status: string }> }>(
      page,
      `/api/tickets/invitations/outgoing?ticketCodes=${seatCodes.acceptRevoke}`
    )
    expect(outgoing.body.invitations).toContainEqual(expect.objectContaining({ id: invitationId, ticketCode: seatCodes.acceptRevoke, status: 'pending' }))

    const inviteeContext = await page.context().browser()!.newContext({ baseURL })
    const inviteePage = await inviteeContext.newPage()
    await loginSeededUser(inviteePage, 'invitee@liveinblack.dev')
    const incoming = await api<{ ok: boolean; invitations: Array<{ id: string; ticketCode: string; hostName: string | null }> }>(inviteePage, '/api/tickets/invitations')
    expect(incoming.body.invitations).toContainEqual(expect.objectContaining({ id: invitationId, ticketCode: seatCodes.acceptRevoke }))

    const accepted = await api<{ ok: boolean; ticket: { ticketCode: string; assignedTo: string | null; assignedName: string | null; seatVersion: number } }>(
      inviteePage,
      '/api/tickets/invitations/accept',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
      }
    )
    expect(accepted.status).toBe(200)
    expect(accepted.body.ticket).toMatchObject({ ticketCode: seatCodes.acceptRevoke })
    expect(accepted.body.ticket.assignedTo).toBeTruthy()

    const inviteeToken = await getTicketToken(inviteePage, seatCodes.acceptRevoke)
    await inviteePage.goto(`/ticket/${inviteeToken}`, { waitUntil: 'domcontentloaded' })
    await expect(inviteePage.getByRole('heading', { name: /Billet valide/i })).toBeVisible()

    await login(page, 'client@liveinblack.dev')
    const revoked = await api<{ ok: boolean; ticket: { ticketCode: string; assignedTo: string | null; assignedName: string | null } }>(page, '/api/tickets/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: seatCodes.acceptRevoke }),
    })
    expect(revoked.status).toBe(200)
    expect(revoked.body.ticket).toMatchObject({ ticketCode: seatCodes.acceptRevoke, assignedTo: null, assignedName: null })

    await inviteePage.goto(`/ticket/${inviteeToken}`, { waitUntil: 'domcontentloaded' })
    await expect(inviteePage.getByRole('heading', { name: /Billet invalide/i })).toBeVisible()
    await inviteeContext.close()
  })

  test('invitee can decline a table seat invitation without assigning the ticket', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')
    const invitationId = await inviteSeat(page, seatCodes.decline)

    const inviteeContext = await page.context().browser()!.newContext({ baseURL })
    const inviteePage = await inviteeContext.newPage()
    await loginSeededUser(inviteePage, 'invitee@liveinblack.dev')
    const declined = await api<{ ok: boolean; invitation: { id: string; ticketCode: string; status: string } }>(inviteePage, '/api/tickets/invitations/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    })
    expect(declined).toMatchObject({ status: 200, body: { ok: true, invitation: { id: invitationId, ticketCode: seatCodes.decline, status: 'declined' } } })

    await login(page, 'client@liveinblack.dev')
    const hostToken = await getTicketToken(page, seatCodes.decline)
    await page.goto(`/ticket/${hostToken}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Billet valide/i })).toBeVisible()
  })

  test('invitee can leave an accepted table seat, invalidating their old ticket token', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')
    const invitationId = await inviteSeat(page, seatCodes.leave)

    const inviteeContext = await page.context().browser()!.newContext({ baseURL })
    const inviteePage = await inviteeContext.newPage()
    await loginSeededUser(inviteePage, 'invitee@liveinblack.dev')
    const accepted = await api<{ ok: boolean; ticket: { ticketCode: string; assignedTo: string | null } }>(inviteePage, '/api/tickets/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    })
    expect(accepted.status).toBe(200)
    expect(accepted.body.ticket.assignedTo).toBeTruthy()

    const inviteeToken = await getTicketToken(inviteePage, seatCodes.leave)
    const left = await api<{ ok: boolean; ticket: { ticketCode: string; assignedTo: string | null; assignedName: string | null } }>(inviteePage, '/api/tickets/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: seatCodes.leave }),
    })
    expect(left.status).toBe(200)
    expect(left.body.ticket).toMatchObject({ ticketCode: seatCodes.leave, assignedTo: null, assignedName: null })

    await inviteePage.goto(`/ticket/${inviteeToken}`, { waitUntil: 'domcontentloaded' })
    await expect(inviteePage.getByRole('heading', { name: /Billet invalide/i })).toBeVisible()
    await inviteeContext.close()
  })
})
