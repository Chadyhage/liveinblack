import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROVIDER_SUB, computeRenewal, deriveSubStatus, subGrantsVisibility,
  dueReminders, cycleKey,
} from '../lib/providerSubscription.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000 // instant fixe pour des tests déterministes

test('renouvellement depuis zéro : 30 j de visibilité + 3 j de grâce', () => {
  const r = computeRenewal({}, NOW)
  assert.equal(r.subscriptionExpiresAt, NOW + 30 * DAY)
  assert.equal(r.gracePeriodEndsAt, NOW + 33 * DAY)
  assert.equal(r.periodStart, NOW)
})

test('renouvellement AVANT expiration : on prolonge depuis l\'expiration, pas depuis le paiement', () => {
  const expiry = NOW + 5 * DAY // encore 5 jours
  const r = computeRenewal({ subscriptionExpiresAt: expiry, subscriptionStartedAt: NOW - 25 * DAY }, NOW)
  // Nouvelle expiration = ancienne expiration + 30 j (les 5 jours restants ne sont pas perdus)
  assert.equal(r.subscriptionExpiresAt, expiry + 30 * DAY)
  assert.equal(r.periodStart, expiry)
})

test('renouvellement APRÈS expiration : on repart de maintenant', () => {
  const expiry = NOW - 10 * DAY // expiré depuis 10 jours
  const r = computeRenewal({ subscriptionExpiresAt: expiry }, NOW)
  assert.equal(r.subscriptionExpiresAt, NOW + 30 * DAY)
  assert.equal(r.periodStart, NOW)
})

test('statuts dérivés des dates', () => {
  assert.equal(deriveSubStatus({}, NOW), 'none')
  assert.equal(deriveSubStatus({ subscriptionExpiresAt: NOW + 20 * DAY }, NOW), 'active')
  assert.equal(deriveSubStatus({ subscriptionExpiresAt: NOW + 5 * DAY }, NOW), 'expiring_soon')
  assert.equal(deriveSubStatus({ subscriptionExpiresAt: NOW - 1 * DAY, gracePeriodEndsAt: NOW + 2 * DAY }, NOW), 'grace')
  assert.equal(deriveSubStatus({ subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 2 * DAY }, NOW), 'expired')
})

test('visibilité : actif et grâce visibles, expiré masqué', () => {
  assert.equal(subGrantsVisibility({ subscriptionExpiresAt: NOW + 10 * DAY }, NOW), true)
  assert.equal(subGrantsVisibility({ subscriptionExpiresAt: NOW - 1 * DAY, gracePeriodEndsAt: NOW + 2 * DAY }, NOW), true)
  assert.equal(subGrantsVisibility({ subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 2 * DAY }, NOW), false)
})

test('rappels : un seul milestone par seuil, jamais deux fois', () => {
  const sub = { subscriptionExpiresAt: NOW + 1 * DAY, gracePeriodEndsAt: NOW + 4 * DAY }
  const first = dueReminders(sub, NOW, {})
  assert.deepEqual(first, ['j1'])
  // déjà envoyé → plus rien
  assert.deepEqual(dueReminders(sub, NOW, { j1: NOW }), [])
})

test('rappel hidden une fois la grâce passée', () => {
  const sub = { subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 1 * DAY }
  assert.deepEqual(dueReminders(sub, NOW, {}), ['hidden'])
})

test('cycleKey change au renouvellement → rappels réinitialisés', () => {
  const before = cycleKey({ subscriptionExpiresAt: NOW + 5 * DAY })
  const after = cycleKey({ subscriptionExpiresAt: NOW + 35 * DAY })
  assert.notEqual(before, after)
})

test('prix et période conformes à la décision fondateur (9000 FCFA / 30 j)', () => {
  assert.equal(PROVIDER_SUB.price, 9000)
  assert.equal(PROVIDER_SUB.currency, 'XOF')
  assert.equal(PROVIDER_SUB.periodDays, 30)
  assert.equal(PROVIDER_SUB.graceDays, 3)
})
