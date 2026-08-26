import crypto from 'node:crypto'
import { expect, test, type Page } from 'playwright/test'
import Stripe from 'stripe'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const ids = {
  event: '66e200000000000000000101',
  stripeExpiringOrder: '66e200000000000000000901',
  fedapayCancellingOrder: '66e200000000000000000902',
  protectedRefundOrder: '66e200000000000000000903',
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

function fedapaySignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},s=${signature}`
}

function stripeSignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  return new Stripe('sk_test_liveinblack_e2e', { apiVersion: '2026-06-24.dahlia' }).webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp,
  })
}

type WalletTicket = {
  ticketCode: string
  eventId: string
  ticketToken: string
  resellable: boolean
  totalPrice: number
  orderId: string | null
  refundRequested: boolean
  cancellationProtectionPurchased: boolean
}

async function walletTickets(page: Page) {
  const wallet = await api<{
    ok: boolean
    groups: Array<{ myTickets: WalletTicket[]; hostedSeats: WalletTicket[] }>
  }>(page, '/api/tickets/mine')
  expect(wallet.status).toBe(200)
  return wallet.body.groups.flatMap((group) => [...group.myTickets, ...group.hostedSeats].map((ticket) => ({ ...ticket, eventId: group.eventId })))
}

async function publicEvent(page: Page) {
  const response = await api<{ event: { places: Array<{ id: string; available: number }> } }>(page, `/api/events/${ids.event}`)
  expect(response.status).toBe(200)
  return response.body.event
}

async function selectAvailablePlaceId(page: Page, preferred: string[] = ['p1', 'p2', 'p3']) {
  const event = await publicEvent(page)
  const place = [
    ...preferred.map((id) => event.places.find((candidate) => candidate.id === id && (candidate.available ?? 0) > 0)),
    ...event.places.filter((candidate) => (candidate.available ?? 0) > 0),
  ].find(Boolean)
  expect(place?.id).toBeTruthy()
  return place!.id
}

test.describe.serial('seeded payments and webhook contracts', () => {
  test('client can complete a local FedaPay checkout and receives a ticket', async ({ page }) => {
    await loginSeededUser(page, 'checkout-buyer@liveinblack.dev')

    const previousCodes = new Set((await walletTickets(page)).map((ticket) => ticket.ticketCode))

    const checkout = await api<{ url: string; transactionId: string; amountTotal: number; currency: string; simulated?: boolean }>(page, '/api/checkout/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.event, placeId: 'p1', qty: 1, isTable: false }),
    })
    expect(checkout.status).toBe(200)
    expect(checkout.body).toMatchObject({ amountTotal: 5250, currency: 'XOF', simulated: true })
    expect(checkout.body.url).toContain('/payment-success?order_id=')
    expect(checkout.body.transactionId).toMatch(/^dev_fedapay_/)

    const created = (await walletTickets(page)).find((ticket) => ticket.eventId === ids.event && !previousCodes.has(ticket.ticketCode))
    expect(created).toMatchObject({ resellable: true })
    expect(created?.ticketToken).toBeTruthy()

    await page.goto(`/ticket/${created!.ticketToken}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Billet valide/i)).toBeVisible()
  })

  test('client can reserve a seat with a local FedaPay deposit and pay the balance', async ({ page }) => {
    await loginSeededUser(page, 'checkout-buyer@liveinblack.dev')

    const previousCodes = new Set((await walletTickets(page)).map((ticket) => ticket.ticketCode))
    const before = await publicEvent(page)
    const beforeAvailable = before.places.find((place) => place.id === 'p1')?.available
    expect(beforeAvailable).toBeGreaterThanOrEqual(1)

    const deposit = await api<{ seatHoldId: string; amountTotal: number; currency: string; simulated?: boolean }>(page, '/api/seat-holds/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.event, placeId: 'p1', tier: 'short' }),
    })
    expect(deposit.status).toBe(200)
    expect(deposit.body).toMatchObject({ amountTotal: 250, currency: 'XOF', simulated: true })
    expect(deposit.body.seatHoldId).toBeTruthy()

    const afterDeposit = await publicEvent(page)
    expect(afterDeposit.places.find((place) => place.id === 'p1')?.available).toBe(beforeAvailable! - 1)

    const holds = await api<{
      ok: boolean
      holds: Array<{ id: string; status: string; depositMinor: number; balanceDueMinor: number }>
    }>(page, '/api/seat-holds')
    expect(holds.status).toBe(200)
    const hold = holds.body.holds.find((item) => item.id === deposit.body.seatHoldId)
    expect(hold).toMatchObject({ status: 'active', depositMinor: 250, balanceDueMinor: 4750 })

    const balance = await api<{ amountTotal: number; currency: string; simulated?: boolean }>(page, '/api/checkout/seat-hold/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatHoldId: deposit.body.seatHoldId }),
    })
    expect(balance.status).toBe(200)
    expect(balance.body).toMatchObject({ amountTotal: 5000, currency: 'XOF', simulated: true })

    const afterBalance = await publicEvent(page)
    expect(afterBalance.places.find((place) => place.id === 'p1')?.available).toBe(beforeAvailable! - 1)

    const created = (await walletTickets(page)).find((ticket) => ticket.eventId === ids.event && !previousCodes.has(ticket.ticketCode))
    expect(created).toMatchObject({ resellable: true })

    const refreshedHolds = await api<{ ok: boolean; holds: Array<{ id: string }> }>(page, '/api/seat-holds')
    expect(refreshedHolds.body.holds.some((item) => item.id === deposit.body.seatHoldId)).toBe(false)
  })

  test('client can complete a local FedaPay checkout with a promo code', async ({ page }) => {
    await loginSeededUser(page, 'checkout-buyer@liveinblack.dev')

    const previousCodes = new Set((await walletTickets(page)).map((ticket) => ticket.ticketCode))
    const placeId = await selectAvailablePlaceId(page)

    const preview = await api<{ ok: boolean; code: string; unitDiscount: number }>(page, `/api/events/${ids.event}/promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'e2e promo', placeId, qty: 1 }),
    })
    expect(preview).toMatchObject({ status: 200, body: { ok: true, code: 'E2EPROMO', unitDiscount: 1000 } })

    const checkout = await api<{ url: string; amountTotal: number; currency: string; simulated?: boolean }>(page, '/api/checkout/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ids.event, placeId, qty: 1, isTable: false, promoCode: 'e2e promo' }),
    })
    expect(checkout.status).toBe(200)
    expect(checkout.body).toMatchObject({ amountTotal: 4200, currency: 'XOF', simulated: true })

    const created = (await walletTickets(page)).find((ticket) => ticket.eventId === ids.event && !previousCodes.has(ticket.ticketCode))
    expect(created).toMatchObject({ totalPrice: 4000, resellable: true })
    expect(created?.ticketToken).toBeTruthy()
  })

  test('client can request a protected FedaPay refund and agent sees it in the manual queue', async ({ browser, baseURL }) => {
    const clientContext = await browser.newContext({ baseURL })
    const page = await clientContext.newPage()
    await loginSeededUser(page, 'payment-buyer@liveinblack.dev')

    const seededTicket = (await walletTickets(page)).find((ticket) => ticket.ticketCode === 'E2E-REFUND-001')
    expect(seededTicket).toMatchObject({
      orderId: ids.protectedRefundOrder,
      refundRequested: false,
      cancellationProtectionPurchased: true,
    })

    const refund = await api<{ ok: boolean; refunded: boolean }>(page, `/api/orders/${ids.protectedRefundOrder}/refund-request`, { method: 'POST' })
    expect(refund).toMatchObject({ status: 200, body: { ok: true, refunded: true } })

    const refreshedTicket = (await walletTickets(page)).find((ticket) => ticket.ticketCode === 'E2E-REFUND-001')
    expect(refreshedTicket).toMatchObject({ refundRequested: true, cancellationProtectionPurchased: true })

    const duplicate = await api<{ error: string }>(page, `/api/orders/${ids.protectedRefundOrder}/refund-request`, { method: 'POST' })
    expect(duplicate).toMatchObject({ status: 409, body: { error: 'already_requested' } })
    await clientContext.close()

    const agentContext = await browser.newContext({ baseURL })
    const agentPage = await agentContext.newPage()
    await loginSeededUser(agentPage, 'agent@liveinblack.dev')
    const queue = await api<{
      ok: boolean
      refunds: Array<{ id: string; eventId: string; paymentRef: string; amountXOF: number; buyerEmail: string }>
    }>(agentPage, '/api/agent/payments/refunds')
    expect(queue.status).toBe(200)
    expect(queue.body.refunds).toContainEqual(
      expect.objectContaining({
        eventId: ids.event,
        paymentRef: 'txn_e2e_refund_protected',
        amountXOF: 5000,
        buyerEmail: 'payment-buyer@liveinblack.dev',
      })
    )

    const queueItem = queue.body.refunds.find((item) => item.paymentRef === 'txn_e2e_refund_protected')
    expect(queueItem?.id).toBeTruthy()

    const completed = await api<{ ok: boolean }>(agentPage, `/api/agent/payments/refunds/${queueItem!.id}/complete`, { method: 'POST' })
    expect(completed).toMatchObject({ status: 200, body: { ok: true } })

    const duplicateComplete = await api<{ error: string }>(agentPage, `/api/agent/payments/refunds/${queueItem!.id}/complete`, { method: 'POST' })
    expect(duplicateComplete).toMatchObject({ status: 409, body: { error: 'not_pending' } })

    const refreshedQueue = await api<{ ok: boolean; refunds: Array<{ paymentRef: string }> }>(agentPage, '/api/agent/payments/refunds')
    expect(refreshedQueue.status).toBe(200)
    expect(refreshedQueue.body.refunds.some((item) => item.paymentRef === 'txn_e2e_refund_protected')).toBe(false)
    await agentContext.close()
  })

  test('FedaPay webhook rejects unsigned and malformed payloads', async ({ page }) => {
    await page.goto('/home')

    const unsigned = await api<{ error: string }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'transaction.approved', entity: { id: 'no-signature', amount: 5000 } }),
    })
    expect(unsigned).toMatchObject({ status: 400, body: { error: 'invalid_signature' } })

    const invalidJson = await api<{ error: string }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature('{bad-json', 'fedapay-e2e-secret'),
      },
      body: '{bad-json',
    })
    expect(invalidJson).toMatchObject({ status: 400, body: { error: 'invalid_json' } })
  })

  test('FedaPay webhook accepts a valid signed event and ignores unknown transactions idempotently', async ({ page }) => {
    await page.goto('/home')
    const payload = JSON.stringify({ name: 'transaction.approved', entity: { id: 'e2e-unknown-transaction', status: 'approved', amount: 5000 } })

    const response = await api<{ received: boolean; ignored?: string }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature(payload, 'fedapay-e2e-secret'),
      },
      body: payload,
    })
    expect(response).toMatchObject({ status: 200, body: { received: true, ignored: 'no_matching_order' } })
  })

  test('Stripe webhook verifies signatures and accepts a paid session without order metadata safely', async ({ page }) => {
    await page.goto('/home')
    const payload = JSON.stringify({
      id: 'evt_e2e_checkout_without_order',
      object: 'event',
      api_version: '2026-06-24.dahlia',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_e2e_without_order',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          metadata: {},
        },
      },
    })

    const missingSignature = await api<{ error: string }>(page, '/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
    expect(missingSignature).toMatchObject({ status: 400, body: { error: 'missing_signature' } })

    const invalidSignature = await api<{ error: string }>(page, '/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(payload, 'wrong-secret') },
      body: payload,
    })
    expect(invalidSignature).toMatchObject({ status: 400, body: { error: 'invalid_signature' } })

    const validSignature = await api<{ received: boolean }>(page, '/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(payload, 'whsec_liveinblack_e2e') },
      body: payload,
    })
    expect(validSignature).toMatchObject({ status: 200, body: { received: true } })
  })

  test('payment cancellation webhooks release held stock idempotently', async ({ page }) => {
    await page.goto('/home')
    const before = await publicEvent(page)
    const beforeAvailable = before.places.find((place) => place.id === 'p1')?.available
    expect(beforeAvailable).toBeGreaterThanOrEqual(0)

    const stripePayload = JSON.stringify({
      id: 'evt_e2e_checkout_expired',
      object: 'event',
      api_version: '2026-06-24.dahlia',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_e2e_expire_stock',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'unpaid',
          metadata: { orderId: ids.stripeExpiringOrder },
        },
      },
    })
    const stripeExpired = await api<{ received: boolean }>(page, '/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': stripeSignature(stripePayload, 'whsec_liveinblack_e2e') },
      body: stripePayload,
    })
    expect(stripeExpired).toMatchObject({ status: 200, body: { received: true } })
    const afterStripe = await publicEvent(page)
    expect(afterStripe.places.find((place) => place.id === 'p1')?.available).toBe(beforeAvailable! + 1)

    const fedapayPayload = JSON.stringify({ name: 'transaction.canceled', entity: { id: 'txn_e2e_cancel_stock', status: 'canceled', amount: 5250 } })
    const fedapayCanceled = await api<{ received: boolean }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature(fedapayPayload, 'fedapay-e2e-secret'),
      },
      body: fedapayPayload,
    })
    expect(fedapayCanceled).toMatchObject({ status: 200, body: { received: true } })
    const afterFedapay = await publicEvent(page)
    expect(afterFedapay.places.find((place) => place.id === 'p1')?.available).toBe(beforeAvailable! + 2)

    const replay = await api<{ received: boolean }>(page, '/api/webhooks/fedapay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': fedapaySignature(fedapayPayload, 'fedapay-e2e-secret'),
      },
      body: fedapayPayload,
    })
    expect(replay).toMatchObject({ status: 200, body: { received: true } })
    const afterReplay = await publicEvent(page)
    expect(afterReplay.places.find((place) => place.id === 'p1')?.available).toBe(beforeAvailable! + 2)
  })
})
