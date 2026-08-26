import crypto from 'node:crypto'
import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const ids = {
  event: '66e200000000000000000101',
  privateEvent: '66e200000000000000000102',
  organizer: '66e200000000000000000002',
  providerUser: '66e200000000000000000003',
  agent: '66e200000000000000000004',
  invitee: '66e200000000000000000007',
  deleteRejectUser: '66e20000000000000000000d',
  deleteApproveUser: '66e20000000000000000000e',
  agentManagedUser: '66e20000000000000000000f',
  inactiveSubProvider: '66e200000000000000000010',
  inactiveSubProviderProfile: '66e200000000000000000203',
  deletionRejectRequest: '66e200000000000000000b01',
  deletionApproveRequest: '66e200000000000000000b02',
  payoutRequest: '66e200000000000000000c01',
  paymentAlert: '66e200000000000000000c02',
  report: '66e200000000000000000603',
}

async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

function fedapaySignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},s=${signature}`
}

async function api<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await page.evaluate(
        async ({ path, init }) => {
          const response = await fetch(path, init)
          return { status: response.status, body: await response.json() }
        },
        { path, init }
      )
    } catch (error) {
      lastError = error
      await page.waitForTimeout(500 * (attempt + 1))
    }
  }
  throw lastError
}

test.describe.serial('seeded advanced business mutations', () => {
  test('client can list and withdraw a ticket from official resale', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const listed = await api<{ ok: boolean; listingId: string; sellerNetMinor: number }>(page, '/api/tickets/resell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: 'E2E-RESALE-001', resalePrice: 4500 }),
    })
    expect(listed.status).toBe(200)
    expect(listed.body.ok).toBe(true)
    expect(listed.body.listingId).toBeTruthy()

    const withdrawn = await api<{ ok: boolean }>(page, `/api/resale-listings/${listed.body.listingId}`, { method: 'DELETE' })
    expect(withdrawn).toMatchObject({ status: 200, body: { ok: true } })
  })

  test('client can invite and cancel a table seat assignment', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const invited = await api<{ ok: boolean; invitation: { ticketCode: string; targetEmail: string; status: string } }>(page, '/api/tickets/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: 'E2E-TABLE-001', targetEmail: 'invitee@liveinblack.dev' }),
    })
    expect(invited).toMatchObject({
      status: 200,
      body: { ok: true, invitation: { ticketCode: 'E2E-TABLE-001', targetEmail: 'invitee@liveinblack.dev', status: 'pending' } },
    })

    const cancelled = await api<{ ok: boolean; invitation: { status: string } }>(page, '/api/tickets/assign/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: 'E2E-TABLE-001' }),
    })
    expect(cancelled).toMatchObject({ status: 200, body: { ok: true, invitation: { status: 'cancelled' } } })
  })

  test('provider can create, update and delete catalog items', async ({ page }) => {
    await login(page, 'prestataire@liveinblack.dev')

    const name = `Pack lumière E2E ${Date.now()}`
    const created = await api<{ ok: boolean; profile: { catalog: Array<{ id: string; name: string }> } }>(page, '/api/providers/me/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: 'Projecteurs et technicien inclus.', price: 90000, currency: 'XOF', unit: 'soirée', category: 'Technique' }),
    })
    expect(created.status).toBe(200)
    const item = created.body.profile.catalog.find((entry) => entry.name === name)
    expect(item?.id).toBeTruthy()

    const updated = await api<{ ok: boolean; profile: { catalog: Array<{ id: string; available: boolean }> } }>(page, `/api/providers/me/catalog/${item!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: false }),
    })
    expect(updated.status).toBe(200)
    expect(updated.body.profile.catalog.find((entry) => entry.id === item!.id)?.available).toBe(false)

    const deleted = await api<{ ok: boolean; profile: { catalog: Array<{ id: string }> } }>(page, `/api/providers/me/catalog/${item!.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect(deleted.body.profile.catalog.some((entry) => entry.id === item!.id)).toBe(false)
  })

  test('provider can activate a local FedaPay subscription through the signed webhook path', async ({ page }) => {
    await login(page, 'prestataire-subscription@liveinblack.dev')

    const before = await api<{
      ok: boolean
      currency: string
      prestataireSubActive: boolean
      prestataireSubStatus: string | null
      prestataireSubRail: string | null
      payments: Array<{ rail: string }>
    }>(page, '/api/subscriptions')
    expect(before).toMatchObject({
      status: 200,
      body: { ok: true, currency: 'XOF', prestataireSubActive: false, prestataireSubStatus: 'none', prestataireSubRail: null, payments: [] },
    })

    const publicBefore = await api<{ providers: Array<{ _id: string; userId: string; name: string }> }>(page, '/api/providers')
    expect(publicBefore.status).toBe(200)
    expect(publicBefore.body.providers.some((provider) => provider.userId === ids.inactiveSubProvider)).toBe(false)

    const checkout = await api<{ url: string; transactionId: string }>(page, '/api/subscriptions/checkout/fedapay', { method: 'POST' })
    expect(checkout.status).toBe(200)
    expect(checkout.body.url).toContain('/offer-services?sub=retour')
    expect(checkout.body.transactionId).toMatch(/^dev_fedapay_sub_/)

    const stillInactive = await api<{ ok: boolean; prestataireSubActive: boolean; payments: Array<{ rail: string }> }>(page, '/api/subscriptions')
    expect(stillInactive).toMatchObject({ status: 200, body: { ok: true, prestataireSubActive: false, payments: [] } })

    const payload = JSON.stringify({
      name: 'transaction.approved',
      entity: { id: checkout.body.transactionId, status: 'approved', amount: 9000 },
    })
    const webhook = await api<{ received: boolean }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature(payload, 'fedapay-e2e-secret'),
      },
      body: payload,
    })
    expect(webhook).toMatchObject({ status: 200, body: { received: true } })

    const after = await api<{
      ok: boolean
      prestataireSubActive: boolean
      prestataireSubStatus: string | null
      prestataireSubRail: string | null
      prestataireSubEnd: string | null
      payments: Array<{ rail: string; amountMinor: number; currency: string }>
    }>(page, '/api/subscriptions')
    expect(after.status).toBe(200)
    expect(after.body).toMatchObject({
      ok: true,
      prestataireSubActive: true,
      prestataireSubStatus: 'active',
      prestataireSubRail: 'fedapay',
      payments: [expect.objectContaining({ rail: 'fedapay', amountMinor: 9000, currency: 'XOF' })],
    })
    expect(new Date(after.body.prestataireSubEnd!).getTime()).toBeGreaterThan(Date.now() + 20 * 24 * 60 * 60 * 1000)

    const replay = await api<{ received: boolean }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature(payload, 'fedapay-e2e-secret'),
      },
      body: payload,
    })
    expect(replay).toMatchObject({ status: 200, body: { received: true } })

    const publicAfter = await api<{ providers: Array<{ _id: string; userId: string; name: string }> }>(page, '/api/providers?q=Sika')
    expect(publicAfter.status).toBe(200)
    expect(publicAfter.body.providers).toContainEqual(expect.objectContaining({ _id: ids.inactiveSubProviderProfile, userId: ids.inactiveSubProvider, name: 'Sika Studio E2E' }))
  })

  test('organizer can manage promo codes, guestlist and event staff', async ({ page }) => {
    await login(page, 'organisateur@liveinblack.dev')

    const code = `E2E${Date.now()}`
    const promoCreated = await api<{ ok: boolean; promo: { code: string; active: boolean } }>(page, `/api/organizer-events/${ids.event}/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, type: 'percent', value: 10, maxUses: 3, placeIds: ['p1'] }),
    })
    expect(promoCreated).toMatchObject({ status: 201, body: { ok: true, promo: { code, active: true } } })

    const promoToggled = await api<{ ok: boolean; active: boolean }>(page, `/api/organizer-events/${ids.event}/promo-codes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(promoToggled).toMatchObject({ status: 200, body: { ok: true, active: false } })

    const guest = await api<{ ok: boolean; entry: { ticketCode: string; guestName: string } }>(page, `/api/organizer-events/${ids.event}/guestlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: 'p1', guestName: 'Invité E2E' }),
    })
    expect(guest.status).toBe(201)
    expect(guest.body.entry.guestName).toBe('Invité E2E')

    const staffAdded = await api<{ ok: boolean; member: { userId: string; role: string } }>(page, `/api/organizer-events/${ids.event}/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: ids.providerUser, role: 'dj' }),
    })
    expect(staffAdded).toMatchObject({ status: 201, body: { ok: true, member: { userId: ids.providerUser, role: 'dj' } } })

    const staffRemoved = await api<{ ok: boolean }>(page, `/api/organizer-events/${ids.event}/staff`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: ids.providerUser }),
    })
    expect(staffRemoved).toMatchObject({ status: 200, body: { ok: true } })

    const guestRemoved = await api<{ ok: boolean }>(page, `/api/organizer-events/${ids.event}/guestlist`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: guest.body.entry.ticketCode }),
    })
    expect(guestRemoved).toMatchObject({ status: 200, body: { ok: true } })

    const promoDeleted = await api<{ ok: boolean }>(page, `/api/organizer-events/${ids.event}/promo-codes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(promoDeleted).toMatchObject({ status: 200, body: { ok: true } })
  })

  test('agent can handle a seeded user report', async ({ page }) => {
    await login(page, 'agent@liveinblack.dev')

    const handled = await api<{ ok: boolean; report: { id: string; handled: boolean; handledNote: string } }>(page, `/api/agent/reports/${ids.report}/handle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Traité par le test E2E seedé.' }),
    })
    expect(handled.status).toBe(200)
    expect(handled.body.report.handled).toBe(true)
    expect(handled.body.report.handledNote).toContain('test E2E')
  })

  test('agent can review, reject and approve account deletion requests', async ({ page }) => {
    await login(page, 'delete-reject@liveinblack.dev')
    let response = await api<{ ok: boolean; pending: boolean; request: { id: string; status: string } }>(page, '/api/profil/supprimer-compte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'DevTest1234!' }),
    })
    expect(response.status).toBe(200)
    const rejectRequestId = response.body.request.id

    await login(page, 'delete-approve@liveinblack.dev')
    response = await api<{ ok: boolean; pending: boolean; request: { id: string; status: string } }>(page, '/api/profil/supprimer-compte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'DevTest1234!' }),
    })
    expect(response.status).toBe(200)
    const approveRequestId = response.body.request.id

    await login(page, 'agent@liveinblack.dev')

    const list = await api<{
      ok: boolean
      requests: Array<{ id: string; userId: string; userEmail: string; userRole: string; status: string }>
    }>(page, '/api/agent/deletion-requests')
    expect(list.status).toBe(200)
    expect(list.body.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rejectRequestId,
          userId: ids.deleteRejectUser,
          userEmail: 'delete-reject@liveinblack.dev',
          userRole: 'prestataire',
          status: 'pending',
        }),
        expect.objectContaining({
          id: approveRequestId,
          userId: ids.deleteApproveUser,
          userEmail: 'delete-approve@liveinblack.dev',
          userRole: 'organisateur',
          status: 'pending',
        }),
      ])
    )

    const detail = await api<{
      ok: boolean
      request: { id: string; audit: { blockers: Array<{ type: string }>; warnings: Array<{ type: string }> } }
    }>(page, `/api/agent/deletion-requests/${approveRequestId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.request.id).toBe(approveRequestId)
    expect(detail.body.request.audit.blockers).toEqual([])

    const rejected = await api<{ ok: boolean }>(page, `/api/agent/deletion-requests/${rejectRequestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Refus E2E pour conserver le compte.' }),
    })
    expect(rejected).toMatchObject({ status: 200, body: { ok: true } })

    const rejectedAgain = await api<{ error: string }>(page, `/api/agent/deletion-requests/${rejectRequestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Deuxième refus E2E.' }),
    })
    expect(rejectedAgain).toMatchObject({ status: 409, body: { error: 'invalid_status' } })

    const approved = await api<{ ok: boolean }>(page, `/api/agent/deletion-requests/${approveRequestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Approbation E2E.' }),
    })
    expect(approved).toMatchObject({ status: 200, body: { ok: true } })

    const approvedAgain = await api<{ error: string }>(page, `/api/agent/deletion-requests/${approveRequestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Deuxième approbation E2E.' }),
    })
    expect(approvedAgain).toMatchObject({ status: 409, body: { error: 'invalid_status' } })

    const approvedUser = await api<{
      ok: boolean
      user: { id: string; email: string; firstName: string; lastName: string; phone: string; disabled: boolean; role: string; roles: string[] }
    }>(page, `/api/agent/users/${ids.deleteApproveUser}`)
    expect(approvedUser.status).toBe(200)
    expect(approvedUser.body.user).toMatchObject({
      id: ids.deleteApproveUser,
      email: `deleted-${ids.deleteApproveUser}@liveinblack.invalid`,
      firstName: '',
      lastName: '',
      phone: '',
      disabled: true,
      role: 'client',
      roles: ['client'],
    })

    const refreshedList = await api<{ ok: boolean; requests: Array<{ id: string }> }>(page, '/api/agent/deletion-requests')
    expect(refreshedList.status).toBe(200)
    expect(refreshedList.body.requests.some((request) => request.id === rejectRequestId)).toBe(false)
    expect(refreshedList.body.requests.some((request) => request.id === approveRequestId)).toBe(false)
  })

  test('agent can settle payout queues and resolve payment alerts', async ({ page }) => {
    await login(page, 'agent@liveinblack.dev')

    const queue = await api<{
      ok: boolean
      failedPayouts: Array<{ eventId: string; sellerUid: string; amountDueXOF: number; failReason: string | null; eventCancelled: boolean }>
      payoutRequests: Array<{ requestId: string; sellerUid: string; amountDueCents: number; payCents: number; mismatch: boolean }>
      balancesNoReq: Array<{ sellerUid: string; amountDueXOF: number; amountDueCents: number }>
    }>(page, '/api/agent/payments/payouts')
    expect(queue.status).toBe(200)
    expect(queue.body.failedPayouts).toContainEqual(
      expect.objectContaining({
        eventId: ids.privateEvent,
        sellerUid: ids.organizer,
        amountDueXOF: 7000,
        failReason: 'Compte mobile money indisponible pour E2E.',
        eventCancelled: false,
      })
    )
    expect(queue.body.payoutRequests).toContainEqual(
      expect.objectContaining({
        requestId: ids.payoutRequest,
        sellerUid: ids.providerUser,
        amountDueCents: 12000,
        payCents: 12000,
        mismatch: true,
      })
    )

    const paidFailed = await api<{ ok: boolean; paid: number }>(page, '/api/agent/payments/payouts/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.privateEvent }),
    })
    expect(paidFailed).toMatchObject({ status: 200, body: { ok: true, paid: 7000 } })

    const duplicatePaidFailed = await api<{ error: string }>(page, '/api/agent/payments/payouts/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.privateEvent }),
    })
    expect(duplicatePaidFailed).toMatchObject({ status: 409, body: { error: 'not_failed' } })

    const settledRequest = await api<{ ok: boolean; paid: number }>(page, '/api/agent/payments/payouts/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerUid: ids.providerUser, amount: 15000, currency: 'EUR', requestId: ids.payoutRequest }),
    })
    expect(settledRequest).toMatchObject({ status: 200, body: { ok: true, paid: 12000 } })

    const duplicateSettle = await api<{ ok: boolean; paid: number }>(page, '/api/agent/payments/payouts/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerUid: ids.providerUser, amount: 15000, currency: 'EUR', requestId: ids.payoutRequest }),
    })
    expect(duplicateSettle).toMatchObject({ status: 200, body: { ok: true, paid: 0 } })

    const alerts = await api<{
      ok: boolean
      alerts: Array<{ id: string; reason: string; eventId: string | null; sellerUid: string | null; details: { source?: string } }>
    }>(page, '/api/agent/payments/alerts')
    expect(alerts.status).toBe(200)
    expect(alerts.body.alerts).toContainEqual(
      expect.objectContaining({
        id: ids.paymentAlert,
        reason: 'e2e_reconciliation_required',
        eventId: ids.event,
        sellerUid: ids.organizer,
        details: expect.objectContaining({ source: 'seed-e2e' }),
      })
    )

    const resolvedAlert = await api<{ ok: boolean }>(page, `/api/agent/payments/alerts/${ids.paymentAlert}/resolve`, { method: 'POST' })
    expect(resolvedAlert).toMatchObject({ status: 200, body: { ok: true } })

    const duplicateResolve = await api<{ error: string }>(page, `/api/agent/payments/alerts/${ids.paymentAlert}/resolve`, { method: 'POST' })
    expect(duplicateResolve).toMatchObject({ status: 404, body: { error: 'not_found_or_resolved' } })

    const refreshedQueue = await api<{
      ok: boolean
      failedPayouts: Array<{ eventId: string }>
      payoutRequests: Array<{ requestId: string }>
      balancesNoReq: Array<{ sellerUid: string; amountDueXOF: number; amountDueCents: number }>
    }>(page, '/api/agent/payments/payouts')
    expect(refreshedQueue.status).toBe(200)
    expect(refreshedQueue.body.failedPayouts.some((item) => item.eventId === ids.privateEvent)).toBe(false)
    expect(refreshedQueue.body.payoutRequests.some((item) => item.requestId === ids.payoutRequest)).toBe(false)
    expect(refreshedQueue.body.balancesNoReq.find((item) => item.sellerUid === ids.providerUser)?.amountDueCents ?? 0).toBe(0)

    const refreshedAlerts = await api<{ ok: boolean; alerts: Array<{ id: string }> }>(page, '/api/agent/payments/alerts')
    expect(refreshedAlerts.status).toBe(200)
    expect(refreshedAlerts.body.alerts.some((alert) => alert.id === ids.paymentAlert)).toBe(false)
  })

  test('agent can search and manage user account fields, email, verification and suspension', async ({ page }) => {
    await login(page, 'agent@liveinblack.dev')

    const listed = await api<{
      ok: boolean
      users: Array<{ id: string; email: string; firstName?: string; disabled: boolean; emailVerified: boolean }>
      total: number
    }>(page, '/api/agent/users?search=agent-managed&pageSize=10')
    expect(listed.status).toBe(200)
    expect(listed.body.users).toContainEqual(
      expect.objectContaining({ id: ids.agentManagedUser, email: 'agent-managed@liveinblack.dev', disabled: false, emailVerified: false })
    )

    const detail = await api<{
      ok: boolean
      user: { id: string; email: string; firstName: string; lastName: string; phone: string; disabled: boolean; emailVerified: boolean }
    }>(page, `/api/agent/users/${ids.agentManagedUser}`)
    expect(detail).toMatchObject({
      status: 200,
      body: {
        ok: true,
        user: {
          id: ids.agentManagedUser,
          email: 'agent-managed@liveinblack.dev',
          firstName: 'Mina',
          lastName: 'Managed',
          phone: '+228 92 44 55 74',
          disabled: false,
          emailVerified: false,
        },
      },
    })

    const firstNameUpdated = await api<{ ok: boolean; user: { firstName: string } }>(page, `/api/agent/users/${ids.agentManagedUser}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Mina-E2E' }),
    })
    expect(firstNameUpdated).toMatchObject({ status: 200, body: { ok: true, user: { firstName: 'Mina-E2E' } } })

    const phoneUpdated = await api<{ ok: boolean; user: { phone: string } }>(page, `/api/agent/users/${ids.agentManagedUser}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+228 92 44 55 75' }),
    })
    expect(phoneUpdated).toMatchObject({ status: 200, body: { ok: true, user: { phone: '+228 92 44 55 75' } } })

    const invalidMultiPatch = await api<{ error: string }>(page, `/api/agent/users/${ids.agentManagedUser}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Too', lastName: 'Many' }),
    })
    expect(invalidMultiPatch).toMatchObject({ status: 400, body: { error: 'invalid_body' } })

    const emailUpdated = await api<{ ok: boolean; user: { email: string; emailVerified: boolean; emailVerifiedAt: string | null } }>(page, `/api/agent/users/${ids.agentManagedUser}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'agent-managed-updated@liveinblack.dev' }),
    })
    expect(emailUpdated).toMatchObject({
      status: 200,
      body: { ok: true, user: { email: 'agent-managed-updated@liveinblack.dev', emailVerified: false, emailVerifiedAt: null } },
    })

    const sameEmail = await api<{ error: string }>(page, `/api/agent/users/${ids.agentManagedUser}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'agent-managed-updated@liveinblack.dev' }),
    })
    expect(sameEmail).toMatchObject({ status: 400, body: { error: 'same_email' } })

    const disabled = await api<{ ok: boolean; user: { disabled: boolean } }>(page, `/api/agent/users/${ids.agentManagedUser}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    })
    expect(disabled).toMatchObject({ status: 200, body: { ok: true, user: { disabled: true } } })

    const disabledFilter = await api<{ ok: boolean; users: Array<{ id: string; disabled: boolean }> }>(page, '/api/agent/users?status=disabled&pageSize=10')
    expect(disabledFilter.status).toBe(200)
    expect(disabledFilter.body.users).toContainEqual(expect.objectContaining({ id: ids.agentManagedUser, disabled: true }))

    const reenabled = await api<{ ok: boolean; user: { disabled: boolean } }>(page, `/api/agent/users/${ids.agentManagedUser}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: false }),
    })
    expect(reenabled).toMatchObject({ status: 200, body: { ok: true, user: { disabled: false } } })

    const selfDisable = await api<{ error: string }>(page, `/api/agent/users/${ids.agent}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    })
    expect(selfDisable).toMatchObject({ status: 400, body: { error: 'self_action' } })

    const verified = await api<{ ok: boolean; user: { emailVerified: boolean; emailVerifiedAt: string | null } }>(page, `/api/agent/users/${ids.agentManagedUser}/verify-email`, {
      method: 'POST',
    })
    expect(verified.status).toBe(200)
    expect(verified.body.user.emailVerified).toBe(true)
    expect(verified.body.user.emailVerifiedAt).toBeTruthy()

    const sendVerification = await api<{ error: string }>(page, `/api/agent/users/${ids.agentManagedUser}/send-verification`, { method: 'POST' })
    expect(sendVerification).toMatchObject({ status: 409, body: { error: 'already_verified' } })
  })

  test('agent can curate homepage actualite and manage public blog posts', async ({ page }) => {
    await login(page, 'agent@liveinblack.dev')

    const beforeConfig = await api<{
      ok: boolean
      config: { active: boolean; title: string; subtitle: string; accent: string; eventIds: string[] }
      candidateEvents: Array<{ id: string; name: string }>
    }>(page, '/api/agent/homepage-config')
    expect(beforeConfig.status).toBe(200)
    expect(beforeConfig.body.candidateEvents).toContainEqual(expect.objectContaining({ id: ids.event, name: 'AFRO NATION LOMÉ' }))

    const updatedConfig = await api<{
      ok: boolean
      config: { active: boolean; title: string; subtitle: string; accent: string; eventIds: string[]; updatedBy: string }
    }>(page, '/api/agent/homepage-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active: true,
        title: 'Actualité E2E',
        subtitle: 'Sélection visible depuis la page accueil.',
        accent: 'gold',
        eventIds: [ids.event, ids.event],
      }),
    })
    expect(updatedConfig).toMatchObject({
      status: 200,
      body: { ok: true, config: { active: true, title: 'Actualité E2E', accent: 'gold', eventIds: [ids.event], updatedBy: ids.agent } },
    })

    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Actualité E2E')).toBeVisible()
    await expect(page.getByRole('main')).toContainText('AFRO NATION LOMÉ')

    const slug = `article-e2e-${Date.now()}`
    const publishedAt = new Date(Date.now() - 60_000).toISOString()
    const postPayload = {
      slug,
      title: 'Article E2E initial',
      excerpt: 'Un article créé par la suite E2E.',
      content: '<p>Contenu initial publié depuis le back-office agent.</p>',
      coverImageUrl: '/images/live-in-black/hero-nightlife.jpg',
      category: 'actualite',
      tags: ['e2e', 'publication'],
      publishedAt,
      authorName: 'Agent LIB',
      metaTitle: 'Article E2E initial',
      metaDescription: 'Article créé par le test end-to-end agent.',
      readingTimeMinutes: 2,
    }

    const createdPost = await api<{ ok: boolean; post: { id: string; slug: string; title: string; category: string } }>(page, '/api/agent/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postPayload),
    })
    expect(createdPost).toMatchObject({ status: 200, body: { ok: true, post: { slug, title: 'Article E2E initial', category: 'actualite' } } })
    const postId = createdPost.body.post.id

    const listedPost = await api<{ ok: boolean; posts: Array<{ id: string; slug: string; title: string }>; totalCount: number }>(page, '/api/agent/blog')
    expect(listedPost.status).toBe(200)
    expect(listedPost.body.posts).toContainEqual(expect.objectContaining({ id: postId, slug, title: 'Article E2E initial' }))

    const fetchedPost = await api<{ ok: boolean; post: { id: string; slug: string; title: string } }>(page, `/api/agent/blog/${postId}`)
    expect(fetchedPost).toMatchObject({ status: 200, body: { ok: true, post: { id: postId, slug, title: 'Article E2E initial' } } })

    const updatedPost = await api<{ ok: boolean; post: { id: string; title: string; excerpt: string; tags: string[] } }>(page, `/api/agent/blog/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...postPayload,
        title: 'Article E2E mis à jour',
        excerpt: 'Un article modifié par la suite E2E.',
        tags: ['e2e', 'publication', 'update'],
        metaTitle: 'Article E2E mis à jour',
      }),
    })
    expect(updatedPost).toMatchObject({ status: 200, body: { ok: true, post: { id: postId, title: 'Article E2E mis à jour', excerpt: 'Un article modifié par la suite E2E.' } } })
    expect(updatedPost.body.post.tags).toContain('update')

    await page.goto(`/blog/${slug}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Article E2E mis à jour')
    await expect(page.getByRole('main')).toContainText('Contenu initial publié')

    const deletedPost = await api<{ ok: boolean }>(page, `/api/agent/blog/${postId}`, { method: 'DELETE' })
    expect(deletedPost).toMatchObject({ status: 200, body: { ok: true } })

    const missingPost = await api<{ error: string }>(page, `/api/agent/blog/${postId}`)
    expect(missingPost).toMatchObject({ status: 404, body: { error: 'not_found' } })

    const disabledConfig = await api<{ ok: boolean; config: { active: boolean; eventIds: string[] } }>(page, '/api/agent/homepage-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false, title: 'Actualité E2E', subtitle: '', accent: 'teal', eventIds: [] }),
    })
    expect(disabledConfig).toMatchObject({ status: 200, body: { ok: true, config: { active: false, eventIds: [] } } })
  })

  test('client, provider and agent can complete the review moderation lifecycle', async ({ browser, baseURL }) => {
    const clientContext = await browser.newContext({ baseURL })
    const clientPage = await clientContext.newPage()
    await login(clientPage, 'client@liveinblack.dev')

    const created = await api<{ ok: boolean; review: { id: string; status: string; rating: number; comment: string; edited: boolean } }>(clientPage, '/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: ids.providerUser, rating: 5, comment: 'Prestation impeccable pour le test E2E.' }),
    })
    expect(created).toMatchObject({
      status: 200,
      body: { ok: true, review: { status: 'published', rating: 5, comment: 'Prestation impeccable pour le test E2E.', edited: false } },
    })
    const reviewId = created.body.review.id

    const edited = await api<{ ok: boolean; review: { id: string; rating: number; edited: boolean } }>(clientPage, '/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: ids.providerUser, rating: 4, comment: 'Prestation impeccable, avis modifié par E2E.' }),
    })
    expect(edited).toMatchObject({ status: 200, body: { ok: true, review: { id: reviewId, rating: 4, edited: true } } })
    await clientContext.close()

    const providerContext = await browser.newContext({ baseURL })
    const providerPage = await providerContext.newPage()
    await login(providerPage, 'prestataire@liveinblack.dev')
    const replied = await api<{ ok: boolean; reply: { text: string; createdAt: string; updatedAt: string } }>(providerPage, `/api/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Merci pour votre retour, au plaisir.' }),
    })
    expect(replied.status).toBe(200)
    expect(replied.body.reply.text).toBe('Merci pour votre retour, au plaisir.')
    await providerContext.close()

    const inviteeContext = await browser.newContext({ baseURL })
    const inviteePage = await inviteeContext.newPage()
    await login(inviteePage, 'invitee@liveinblack.dev')
    const reported = await api<{ ok: boolean }>(inviteePage, `/api/reviews/${reviewId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'spam', details: 'Signalement E2E pour modération.' }),
    })
    expect(reported).toMatchObject({ status: 200, body: { ok: true } })
    await inviteeContext.close()

    const agentContext = await browser.newContext({ baseURL })
    const agentPage = await agentContext.newPage()
    await login(agentPage, 'agent@liveinblack.dev')
    const queue = await api<{ ok: boolean; reviews: Array<{ id: string; status: string; reportCount: number; reports: Array<{ reason: string; status: string }> }> }>(agentPage, '/api/agent/reviews')
    expect(queue.status).toBe(200)
    expect(queue.body.reviews.find((review) => review.id === reviewId)).toMatchObject({
      status: 'published',
      reportCount: 1,
      reports: [expect.objectContaining({ reason: 'spam', status: 'open' })],
    })

    const noted = await api<{ ok: boolean; review: { id: string; adminNote: string; status: string } }>(agentPage, `/api/agent/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'note', note: 'Surveillé par E2E.' }),
    })
    expect(noted).toMatchObject({ status: 200, body: { ok: true, review: { id: reviewId, status: 'published', adminNote: 'Surveillé par E2E.' } } })

    const hidden = await api<{ ok: boolean; review: { id: string; status: string; hiddenBy: string | null; reports: Array<{ status: string }> } }>(agentPage, `/api/agent/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'hide' }),
    })
    expect(hidden.status).toBe(200)
    expect(hidden.body.review).toMatchObject({ id: reviewId, status: 'hidden', hiddenBy: ids.agent })
    expect(hidden.body.review.reports.every((report) => report.status === 'action_taken')).toBe(true)

    const republished = await api<{ ok: boolean; review: { id: string; status: string; hiddenBy: string | null } }>(agentPage, `/api/agent/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'publish' }),
    })
    expect(republished).toMatchObject({ status: 200, body: { ok: true, review: { id: reviewId, status: 'published', hiddenBy: null } } })

    const deleted = await api<{ ok: boolean; review: { id: string; status: string; deletedBy: string | null } }>(agentPage, `/api/agent/reviews/${reviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'delete' }),
    })
    expect(deleted).toMatchObject({ status: 200, body: { ok: true, review: { id: reviewId, status: 'deleted', deletedBy: ids.agent } } })
    await agentContext.close()
  })
})
