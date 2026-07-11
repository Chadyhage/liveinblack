import test from 'node:test'
import assert from 'node:assert/strict'
import {
  groupTicketsByPayment, stripeRefundParams, refundDocId, refundIdempotencyKey,
  stripeAmounts, refundStripePayment, recordFedapayRefund, processEventRefunds,
  refundPostCancellationStripe,
} from '../lib/eventRefunds.js'

// ── Faux Admin SDK Firestore (en mémoire) ─────────────────────────────────────
const FieldValue = {
  increment: (n) => ({ __increment: Number(n) || 0 }),
  serverTimestamp: () => ({ __ts: true }),
}
function applyValue(existing, value) {
  if (value && typeof value === 'object' && '__increment' in value) return (Number(existing) || 0) + value.__increment
  if (value && typeof value === 'object' && '__ts' in value) return 1234567890
  return value
}
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed)) // path -> data
  function docRef(path) {
    return {
      path,
      async get() { return { exists: store.has(path), data: () => store.get(path) } },
      set(data, opts) {
        const base = (opts && opts.merge && store.has(path)) ? { ...store.get(path) } : {}
        for (const [k, v] of Object.entries(data)) base[k] = applyValue(base[k], v)
        store.set(path, base)
      },
    }
  }
  const db = {
    _store: store,
    collection: (name) => ({ doc: (id) => docRef(`${name}/${id}`) }),
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get() },
        set(ref, data, opts) { ref.set(data, opts) },
      }
      return fn(tx)
    },
  }
  return db
}

// ── Faux Stripe ───────────────────────────────────────────────────────────────
function makeStripe(sessionsById) {
  const calls = { retrieve: [], refunds: [] }
  return {
    calls,
    checkout: { sessions: { async retrieve(id) { calls.retrieve.push(id); return sessionsById[id] } } },
    refunds: { async create(params, opts) { calls.refunds.push({ params, opts }); return { id: 'ref_' + (calls.refunds.length) } } },
  }
}

// ── Helpers purs ──────────────────────────────────────────────────────────────
test('groupTicketsByPayment : un panier multi-billets = UN seul paiement', () => {
  const { stripe } = groupTicketsByPayment([
    { ticketCode: 'A', paid: true, stripeSessionId: 'cs_1' },
    { ticketCode: 'B', paid: true, stripeSessionId: 'cs_1' },
    { ticketCode: 'C', paid: true, stripeSessionId: 'cs_1' },
  ])
  assert.equal(stripe.length, 1)          // 3 billets → 1 remboursement
  assert.equal(stripe[0].tickets.length, 3)
})

test('groupTicketsByPayment : exclut révoqués + impayés ; GARDE les annulés (rejeu), sépare les rails', () => {
  const r = groupTicketsByPayment([
    { ticketCode: 'A', paid: true, stripeSessionId: 'cs_1' },
    { ticketCode: 'B', paid: true, stripeSessionId: 'cs_1', revoked: true },   // exclu (siège repris par l'hôte)
    { ticketCode: 'C', paid: true, stripeSessionId: 'cs_2', cancelled: true }, // GARDÉ : le rejeu doit retenter son remboursement
    { ticketCode: 'D', paid: false, stripeSessionId: 'cs_3' },                 // exclu (impayé)
    { ticketCode: 'E', paid: true, fedapayTxnId: '900' },
    { ticketCode: 'F', paid: true },                                           // orphelin
  ])
  assert.equal(r.stripe.length, 2)                          // cs_1 (A) + cs_2 (C annulé, RÉINCLUS pour le rejeu)
  assert.equal(r.stripe.find(g => g.paymentRef === 'cs_1').tickets.length, 1) // B révoqué exclu
  assert.equal(r.stripe.find(g => g.paymentRef === 'cs_2').tickets.length, 1) // C annulé conservé
  assert.equal(r.fedapay.length, 1)
  assert.deepEqual(r.orphans.map(t => t.ticketCode), ['F'])
})

test('groupTicketsByPayment : correctif audit #71 — un billet annulé reste regroupé (le rejeu retente)', () => {
  // Un run précédent a marqué le billet cancelled:true mais son remboursement
  // avait échoué : il DOIT revenir dans le groupe pour être retenté (l'anti-double
  // est porté par le doc event_refunds, pas par l'état cancelled du billet).
  const r = groupTicketsByPayment([{ ticketCode: 'X', paid: true, stripeSessionId: 'cs_9', cancelled: true }])
  assert.equal(r.stripe.length, 1)
  assert.equal(r.stripe[0].paymentRef, 'cs_9')
})

test('stripeRefundParams : auto récupère la part vendeur + le frais, sinon rien', () => {
  assert.deepEqual(stripeRefundParams('auto'), { reverse_transfer: true, refund_application_fee: true })
  assert.deepEqual(stripeRefundParams('ledger'), {})
  assert.deepEqual(stripeRefundParams('none'), {})
})

test('stripeAmounts : total remboursé + part vendeur à renverser', () => {
  assert.deepEqual(stripeAmounts(2049, 549), { amountCents: 2049, owedCents: 1500 })
  assert.deepEqual(stripeAmounts(0, 0), { amountCents: 0, owedCents: 0 })
})

test('clés stables : docId et idempotence', () => {
  assert.equal(refundDocId('e1', 'cs_1'), 'e1__cs_1')
  assert.equal(refundIdempotencyKey('e1', 'cs_1'), 'evcancel-e1-cs_1')
})

// ── Remboursement Stripe ──────────────────────────────────────────────────────
test('refundStripePayment (ledger) : rembourse le PI + renverse le crédit vendeur (booking settled)', async () => {
  const db = makeDb({ 'seller_balances/seller1': { amountDueCents: 1500 }, 'bookings/bk1': { settled: true } })
  const stripe = makeStripe({
    cs_1: { payment_intent: 'pi_1', amount_total: 2049, currency: 'eur', metadata: { connectMode: 'ledger', sellerUid: 'seller1', feeCents: '549', bookingId: 'bk1' }, customer_details: { email: 'buyer@x.com' } },
  })
  const r = await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_1' })
  assert.equal(r.ok, true)
  assert.equal(r.amountCents, 2049)
  assert.deepEqual(stripe.calls.refunds[0].params, { payment_intent: 'pi_1' }) // pas de reverse_transfer en ledger
  assert.equal(stripe.calls.refunds[0].opts.idempotencyKey, 'evcancel-e1-cs_1')
  // seller_balances renversé de owed = 2049 - 549 = 1500 → 0 (car booking settled → crédité)
  assert.equal(db._store.get('seller_balances/seller1').amountDueCents, 0)
  const doc = db._store.get('event_refunds/e1__cs_1')
  assert.equal(doc.status, 'refunded')
  assert.equal(doc.ledgerReversed, true)
  assert.equal(doc.buyerEmail, 'buyer@x.com')
})

test('refundStripePayment (ledger) : ne renverse PAS si le crédit n’a jamais eu lieu (booking non settled)', async () => {
  // Correctif audit #71 (pairage crédit/renversement) : si la garde anti-course du
  // webhook a sauté le crédit vendeur (booking non settled), renverser décrémenterait
  // un solde jamais crédité → sous-paiement de l'organisateur. L'acheteur est quand
  // même remboursé ; seul le renversement ledger est correctement omis.
  const db = makeDb({ 'seller_balances/s1': { amountDueCents: 1500 } }) // pas de bookings/bk2 settled
  const stripe = makeStripe({
    cs_ns: { payment_intent: 'pi_ns', amount_total: 2049, currency: 'eur', metadata: { connectMode: 'ledger', sellerUid: 's1', feeCents: '549', bookingId: 'bk2' } },
  })
  const r = await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_ns' })
  assert.equal(r.ok, true) // acheteur remboursé
  assert.equal(db._store.get('seller_balances/s1').amountDueCents, 1500) // ledger NON décrémenté
  assert.equal(db._store.get('event_refunds/e1__cs_ns').ledgerReversed, false)
})

test('refundStripePayment (auto) : reverse_transfer + refund_application_fee, PAS de renversement ledger', async () => {
  const db = makeDb({ 'seller_balances/seller1': { amountDueCents: 5000 } })
  const stripe = makeStripe({
    cs_2: { payment_intent: 'pi_2', amount_total: 3000, currency: 'eur', metadata: { connectMode: 'auto', sellerUid: 'seller1', feeCents: '200' } },
  })
  const r = await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_2' })
  assert.equal(r.ok, true)
  assert.deepEqual(stripe.calls.refunds[0].params, { payment_intent: 'pi_2', reverse_transfer: true, refund_application_fee: true })
  // En mode auto l'argent est parti au vendeur via Stripe : on ne touche PAS le ledger interne.
  assert.equal(db._store.get('seller_balances/seller1').amountDueCents, 5000)
  assert.equal(db._store.get('event_refunds/e1__cs_2').ledgerReversed, false)
})

test('refundStripePayment : IDEMPOTENT — 2e passage ne rembourse pas et ne re-renverse pas', async () => {
  const db = makeDb({ 'seller_balances/seller1': { amountDueCents: 1500 }, 'bookings/bk1': { settled: true } })
  const stripe = makeStripe({
    cs_1: { payment_intent: 'pi_1', amount_total: 2049, currency: 'eur', metadata: { connectMode: 'ledger', sellerUid: 'seller1', feeCents: '549', bookingId: 'bk1' } },
  })
  await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_1' })
  const r2 = await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_1' })
  assert.equal(r2.skipped, true)
  assert.equal(stripe.calls.refunds.length, 1)                 // un SEUL remboursement Stripe
  assert.equal(db._store.get('seller_balances/seller1').amountDueCents, 0) // renversé une seule fois
})

test('refundStripePayment : session sans paiement abouti → no_payment, aucun remboursement', async () => {
  const db = makeDb()
  const stripe = makeStripe({ cs_x: { payment_intent: null, amount_total: 0, currency: 'eur', metadata: {} } })
  const r = await refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_x' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_payment_intent')
  assert.equal(stripe.calls.refunds.length, 0)
  assert.equal(db._store.get('event_refunds/e1__cs_x').status, 'no_payment')
})

test('refundStripePayment : échec Stripe → doc "failed" durable + relance (rejouable)', async () => {
  // Correctif audit #71 : un remboursement échoué laisse une trace DURABLE et
  // relance l’erreur (collectée dans stripeFailed). Le doc "failed" ≠ "refunded"
  // → le rejeu de cancel_event le retentera (billet réinclus dans le groupe).
  const db = makeDb()
  const stripe = {
    calls: { refunds: [] },
    checkout: { sessions: { async retrieve() { return { payment_intent: 'pi_1', amount_total: 2000, currency: 'eur', metadata: {} } } } },
    refunds: { async create() { throw new Error('Stripe 429 rate limit') } },
  }
  await assert.rejects(() => refundStripePayment(stripe, db, FieldValue, { eventId: 'e1', paymentRef: 'cs_f' }), /429/)
  const doc = db._store.get('event_refunds/e1__cs_f')
  assert.equal(doc.status, 'failed')
  assert.match(doc.error, /429/)
})

// ── Remboursement d'un paiement confirmé APRÈS l'annulation (webhook) ─────────
test('refundPostCancellationStripe : rembourse SANS renverser le ledger (jamais crédité)', async () => {
  const db = makeDb({ 'seller_balances/s1': { amountDueCents: 9999 } })
  const stripe = makeStripe({})
  const session = { id: 'cs_post', payment_intent: 'pi_p', amount_total: 3000, currency: 'eur', metadata: { connectMode: 'ledger', sellerUid: 's1', feeCents: '200' }, customer_details: { email: 'late@x.com' } }
  const r = await refundPostCancellationStripe(stripe, db, { eventId: 'e1', session })
  assert.equal(r.ok, true)
  assert.deepEqual(stripe.calls.refunds[0].params, { payment_intent: 'pi_p' }) // ledger → pas de reverse_transfer
  // Le ledger n'est PAS touché : ce paiement n'a jamais crédité seller_balances.
  assert.equal(db._store.get('seller_balances/s1').amountDueCents, 9999)
  const doc = db._store.get('event_refunds/e1__cs_post')
  assert.equal(doc.status, 'refunded')
  assert.equal(doc.reason, 'paid_after_cancel')
  assert.equal(doc.ledgerReversed, false)
})

test('refundPostCancellationStripe (auto) : reverse_transfer + refund_application_fee', async () => {
  const db = makeDb()
  const stripe = makeStripe({})
  const session = { id: 'cs_post2', payment_intent: 'pi_p2', amount_total: 5000, currency: 'eur', metadata: { connectMode: 'auto' } }
  await refundPostCancellationStripe(stripe, db, { eventId: 'e1', session })
  assert.deepEqual(stripe.calls.refunds[0].params, { payment_intent: 'pi_p2', reverse_transfer: true, refund_application_fee: true })
})

test('refundPostCancellationStripe : idempotent (2e passage skip, un seul remboursement)', async () => {
  const db = makeDb()
  const stripe = makeStripe({})
  const session = { id: 'cs_post3', payment_intent: 'pi_p3', amount_total: 1000, currency: 'eur', metadata: {} }
  await refundPostCancellationStripe(stripe, db, { eventId: 'e1', session })
  const r2 = await refundPostCancellationStripe(stripe, db, { eventId: 'e1', session })
  assert.equal(r2.skipped, true)
  assert.equal(stripe.calls.refunds.length, 1)
})

// ── Worklist FedaPay ──────────────────────────────────────────────────────────
test('recordFedapayRefund : écrit la liste manuelle (montant + email), idempotent', async () => {
  const db = makeDb({ 'fedapay_txns/900': { amountTotal: 5300, userEmail: 'ali@tg.com' } })
  const r = await recordFedapayRefund(db, FieldValue, { eventId: 'e1', paymentRef: '900', tickets: [{}, {}] })
  assert.equal(r.status, 'pending_manual')
  const doc = db._store.get('event_refunds/e1__900')
  assert.equal(doc.amountXOF, 5300)
  assert.equal(doc.buyerEmail, 'ali@tg.com')
  assert.equal(doc.ticketCount, 2)
  // 2e passage : idempotent (déjà pending_manual)
  const r2 = await recordFedapayRefund(db, FieldValue, { eventId: 'e1', paymentRef: '900', tickets: [{}, {}] })
  assert.equal(r2.skipped, true)
})

test('recordFedapayRefund : renverse seller_balances.amountDueXOF SI settled (symétrie EUR), idempotent', async () => {
  const db = makeDb({
    'seller_balances/orga1': { amountDueXOF: 5000 },
    // settled:true → le vendeur A ÉTÉ crédité (owed = 5300 - 300 = 5000)
    'fedapay_txns/901': { amountTotal: 5300, feeAmount: 300, sellerUid: 'orga1', settled: true, userEmail: 'a@tg.com' },
  })
  await recordFedapayRefund(db, FieldValue, { eventId: 'e2', paymentRef: '901', tickets: [{}] })
  assert.equal(db._store.get('seller_balances/orga1').amountDueXOF, 0) // renversé
  assert.equal(db._store.get('event_refunds/e2__901').ledgerReversedXOF, true)
  // 2e passage : PAS de double décrément (idempotent via skip pending_manual)
  await recordFedapayRefund(db, FieldValue, { eventId: 'e2', paymentRef: '901', tickets: [{}] })
  assert.equal(db._store.get('seller_balances/orga1').amountDueXOF, 0)
})

test('recordFedapayRefund : ne renverse RIEN si non settled (paiement capté avant crédit vendeur)', async () => {
  const db = makeDb({
    'seller_balances/orga2': { amountDueXOF: 5000 },
    // settled absent → garde webhook a capté le paiement AVANT le crédit vendeur
    'fedapay_txns/902': { amountTotal: 5300, feeAmount: 300, sellerUid: 'orga2', userEmail: 'b@tg.com' },
  })
  await recordFedapayRefund(db, FieldValue, { eventId: 'e3', paymentRef: '902', tickets: [{}] })
  assert.equal(db._store.get('seller_balances/orga2').amountDueXOF, 5000) // intact
  assert.equal(db._store.get('event_refunds/e3__902').ledgerReversedXOF, false)
})

// ── Orchestration ─────────────────────────────────────────────────────────────
test('processEventRefunds : traite Stripe + FedaPay, remonte orphelins et échecs', async () => {
  const db = makeDb({
    'seller_balances/s1': { amountDueCents: 1500 },
    'fedapay_txns/900': { amountTotal: 5300, userEmail: 'ali@tg.com' },
  })
  const stripe = makeStripe({
    cs_1: { payment_intent: 'pi_1', amount_total: 2049, currency: 'eur', metadata: { connectMode: 'ledger', sellerUid: 's1', feeCents: '549' } },
  })
  const tickets = [
    { ticketCode: 'A', paid: true, stripeSessionId: 'cs_1' },
    { ticketCode: 'B', paid: true, stripeSessionId: 'cs_1' }, // même paiement
    { ticketCode: 'C', paid: true, fedapayTxnId: '900' },
    { ticketCode: 'D', paid: true },                          // orphelin
  ]
  const out = await processEventRefunds(stripe, db, FieldValue, { eventId: 'e1', tickets })
  assert.equal(out.stripeRefunded.length, 1)   // 2 billets, 1 paiement
  assert.equal(out.fedapayWorklist.length, 1)
  assert.deepEqual(out.orphans, ['D'])
  assert.equal(stripe.calls.refunds.length, 1)
})
