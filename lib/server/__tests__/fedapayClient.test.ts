// Port du sous-ensemble signature/webhook de scripts/fedapay.test.mjs
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyWebhookSignature, isApprovedTransactionEvent, transactionAmountMatches } from '../fedapayClient'

function signedHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},s=${sig}`
}

describe('verifyWebhookSignature', () => {
  const secret = 'wh_sandbox_test'
  const payload = JSON.stringify({ name: 'transaction.approved', entity: { id: 42 } })

  it('acceptée quand valide (string ou Buffer)', () => {
    expect(verifyWebhookSignature(payload, signedHeader(payload, secret), secret)).toBe(true)
    expect(verifyWebhookSignature(Buffer.from(payload), signedHeader(payload, secret), secret)).toBe(true)
  })

  it('rejetée si secret/corps/entête falsifiés', () => {
    expect(verifyWebhookSignature(payload, signedHeader(payload, 'wh_autre'), secret)).toBe(false)
    expect(verifyWebhookSignature(payload + 'x', signedHeader(payload, secret), secret)).toBe(false)
    expect(verifyWebhookSignature(payload, '', secret)).toBe(false)
    expect(verifyWebhookSignature(payload, 't=abc,s=', secret)).toBe(false)
  })

  it('rejetée au-delà de la tolérance anti-replay (5 min)', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 3600
    const futureTs = Math.floor(Date.now() / 1000) + 3600
    expect(verifyWebhookSignature(payload, signedHeader(payload, secret, oldTs), secret)).toBe(false)
    expect(verifyWebhookSignature(payload, signedHeader(payload, secret, futureTs), secret)).toBe(false)
  })
})

describe('isApprovedTransactionEvent', () => {
  it('approved direct ou via transaction.updated', () => {
    expect(isApprovedTransactionEvent('transaction.approved', { status: 'approved' })).toBe(true)
    expect(isApprovedTransactionEvent('transaction.updated', { status: 'approved' })).toBe(true)
    expect(isApprovedTransactionEvent('transaction.updated', { status: 'pending' })).toBe(false)
    expect(isApprovedTransactionEvent('transaction.declined', { status: 'declined' })).toBe(false)
  })
})

describe('transactionAmountMatches', () => {
  it('aucun billet si le montant ne correspond pas exactement', () => {
    expect(transactionAmountMatches(12800, 12800)).toBe(true)
    expect(transactionAmountMatches(12799, 12800)).toBe(false)
    expect(transactionAmountMatches(12801, 12800)).toBe(false)
    expect(transactionAmountMatches(0, 0)).toBe(false)
  })
})
