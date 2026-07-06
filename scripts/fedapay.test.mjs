import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { computeTicketFeeCents, computeTicketFeeXOF, regionToCurrency, FEES } from '../lib/fees.js'
import { verifyWebhookSignature } from '../lib/fedapay.js'
import { fmtMoney, eventCurrency, regionToCurrency as regionToCurrencyClient } from '../src/utils/money.js'

// ─── Frais de service FCFA (5 % + 300, plafond 1 500, gratuit si billet gratuit) ──
test('frais XOF : 5% + 300 FCFA par billet', () => {
  // Billet 10 000 FCFA → 500 + 300 = 800 FCFA
  assert.equal(computeTicketFeeXOF(10000, 1), 800)
  // 3 billets → 3 × 800
  assert.equal(computeTicketFeeXOF(10000, 3), 2400)
})

test('frais XOF : plafonné à 1 500 FCFA par billet', () => {
  // Billet 100 000 FCFA → 5 000 + 300 = 5 300 → plafonné 1 500
  assert.equal(computeTicketFeeXOF(100000, 1), 1500)
  assert.equal(computeTicketFeeXOF(100000, 2), 3000)
})

test('frais XOF : gratuit sur les billets gratuits et qty invalide', () => {
  assert.equal(computeTicketFeeXOF(0, 3), 0)
  assert.equal(computeTicketFeeXOF(5000, 0), 0)
  assert.equal(computeTicketFeeXOF(-100, 1), 0)
})

test('frais EUR inchangés (régression)', () => {
  // Billet 10 € → 50 + 49 = 99 centimes
  assert.equal(computeTicketFeeCents(1000, 1), 99)
  assert.equal(FEES.TICKET_XOF.paidBy, 'buyer')
})

// ─── Devise par région (serveur + client alignés) ──────────────────────────────
test('regionToCurrency : Togo/Bénin → XOF, France/défaut → EUR (serveur)', () => {
  assert.equal(regionToCurrency('Togo'), 'XOF')
  assert.equal(regionToCurrency('Bénin'), 'XOF')
  assert.equal(regionToCurrency('benin'), 'XOF')
  assert.equal(regionToCurrency('France'), 'EUR')
  assert.equal(regionToCurrency(''), 'EUR')
  assert.equal(regionToCurrency(null), 'EUR')
})

test('regionToCurrency : client identique au serveur', () => {
  for (const r of ['Togo', 'Bénin', 'benin', 'France', '', 'Lomé']) {
    assert.equal(regionToCurrencyClient(r), regionToCurrency(r))
  }
})

test('eventCurrency : champ currency EXPLICITE uniquement — jamais de fallback région', () => {
  assert.equal(eventCurrency({ currency: 'XOF', region: 'France' }), 'XOF')
  assert.equal(eventCurrency({ currency: 'xof' }), 'XOF')
  // CRITIQUE : un event Togo créé AVANT le multi-devise (prix saisis en €,
  // pas de champ currency) doit rester EUR — sinon il serait bradé en FCFA.
  assert.equal(eventCurrency({ region: 'Togo' }), 'EUR')
  assert.equal(eventCurrency({ region: 'France' }), 'EUR')
  assert.equal(eventCurrency(null), 'EUR')
})

// ─── Formatage monétaire ───────────────────────────────────────────────────────
test('fmtMoney : XOF entier avec suffixe FCFA, EUR avec décimales seulement si utiles', () => {
  assert.equal(fmtMoney(5000, 'XOF').replace(/ | /g, ' '), '5 000 FCFA')
  assert.equal(fmtMoney(12, 'EUR').replace(/ | /g, ' '), '12 €')
  assert.equal(fmtMoney(12.5, 'EUR').replace(/ | /g, ' '), '12,50 €')
})

// ─── Signature webhook FedaPay (schéma Stripe-like t=...,s=hmac) ───────────────
function signedHeader(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},s=${sig}`
}

test('signature webhook : acceptée quand valide', () => {
  const payload = JSON.stringify({ name: 'transaction.approved', entity: { id: 42 } })
  const secret = 'wh_sandbox_test'
  assert.equal(verifyWebhookSignature(payload, signedHeader(payload, secret), secret), true)
  assert.equal(verifyWebhookSignature(Buffer.from(payload), signedHeader(payload, secret), secret), true)
})

test('signature webhook : rejetée si secret/corps/entête falsifiés', () => {
  const payload = JSON.stringify({ name: 'transaction.approved', entity: { id: 42 } })
  const secret = 'wh_sandbox_test'
  // Mauvais secret
  assert.equal(verifyWebhookSignature(payload, signedHeader(payload, 'wh_autre'), secret), false)
  // Corps modifié après signature
  assert.equal(verifyWebhookSignature(payload + 'x', signedHeader(payload, secret), secret), false)
  // Entête vide / malformé
  assert.equal(verifyWebhookSignature(payload, '', secret), false)
  assert.equal(verifyWebhookSignature(payload, 't=abc,s=', secret), false)
})

test('signature webhook : rejetée au-delà de la tolérance anti-replay (5 min)', () => {
  const payload = '{"name":"transaction.approved"}'
  const secret = 'wh_sandbox_test'
  const oldTs = Math.floor(Date.now() / 1000) - 3600
  assert.equal(verifyWebhookSignature(payload, signedHeader(payload, secret, oldTs), secret), false)
})
