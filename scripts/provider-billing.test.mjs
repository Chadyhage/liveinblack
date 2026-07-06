import test from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionNeedsCancellation } from '../lib/providerBilling.js'

test('suppression compte : annule tous les abonnements encore facturables', () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    assert.equal(subscriptionNeedsCancellation({ id: `sub_${status}`, status }), true, status)
  }
})

test('suppression compte : ne réannule pas les abonnements déjà terminés', () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    assert.equal(subscriptionNeedsCancellation({ id: `sub_${status}`, status }), false, status)
  }
  assert.equal(subscriptionNeedsCancellation(null), false)
})
