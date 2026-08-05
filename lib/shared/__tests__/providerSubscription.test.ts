// Tests UNITAIRES purs (aucune base) pour lib/shared/providerSubscription.ts
// (#8 phase prestataire — port fidèle de scripts/providerSubscription.test.mjs).
import { describe, it, expect } from 'vitest'
import { PROVIDER_SUB, computeRenewal, deriveSubStatus, subGrantsVisibility, dueReminders, cycleKey } from '../providerSubscription'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000 // instant fixe pour des tests déterministes

describe('computeRenewal', () => {
  it('renouvellement depuis zéro : 30 j de visibilité + 3 j de grâce', () => {
    const r = computeRenewal({}, NOW)
    expect(r.subscriptionExpiresAt).toBe(NOW + 30 * DAY)
    expect(r.gracePeriodEndsAt).toBe(NOW + 33 * DAY)
    expect(r.periodStart).toBe(NOW)
  })

  it("renouvellement AVANT expiration : on prolonge depuis l'expiration, pas depuis le paiement", () => {
    const expiry = NOW + 5 * DAY
    const r = computeRenewal({ subscriptionExpiresAt: expiry, subscriptionStartedAt: NOW - 25 * DAY }, NOW)
    expect(r.subscriptionExpiresAt).toBe(expiry + 30 * DAY)
    expect(r.periodStart).toBe(expiry)
  })

  it('renouvellement APRÈS expiration : on repart de maintenant', () => {
    const expiry = NOW - 10 * DAY
    const r = computeRenewal({ subscriptionExpiresAt: expiry }, NOW)
    expect(r.subscriptionExpiresAt).toBe(NOW + 30 * DAY)
    expect(r.periodStart).toBe(NOW)
  })
})

describe('deriveSubStatus', () => {
  it('statuts dérivés des dates', () => {
    expect(deriveSubStatus({}, NOW)).toBe('none')
    expect(deriveSubStatus({ subscriptionExpiresAt: NOW + 20 * DAY }, NOW)).toBe('active')
    expect(deriveSubStatus({ subscriptionExpiresAt: NOW + 5 * DAY }, NOW)).toBe('expiring_soon')
    expect(deriveSubStatus({ subscriptionExpiresAt: NOW - 1 * DAY, gracePeriodEndsAt: NOW + 2 * DAY }, NOW)).toBe('grace')
    expect(deriveSubStatus({ subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 2 * DAY }, NOW)).toBe('expired')
  })
})

describe('subGrantsVisibility', () => {
  it('actif et grâce visibles, expiré masqué', () => {
    expect(subGrantsVisibility({ subscriptionExpiresAt: NOW + 10 * DAY }, NOW)).toBe(true)
    expect(subGrantsVisibility({ subscriptionExpiresAt: NOW - 1 * DAY, gracePeriodEndsAt: NOW + 2 * DAY }, NOW)).toBe(true)
    expect(subGrantsVisibility({ subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 2 * DAY }, NOW)).toBe(false)
  })
})

describe('dueReminders', () => {
  it('un seul milestone par seuil, jamais deux fois', () => {
    const sub = { subscriptionExpiresAt: NOW + 1 * DAY, gracePeriodEndsAt: NOW + 4 * DAY }
    expect(dueReminders(sub, NOW, {})).toEqual(['j1'])
    expect(dueReminders(sub, NOW, { j1: NOW })).toEqual([])
  })

  it('rappel hidden une fois la grâce passée', () => {
    const sub = { subscriptionExpiresAt: NOW - 5 * DAY, gracePeriodEndsAt: NOW - 1 * DAY }
    expect(dueReminders(sub, NOW, {})).toEqual(['hidden'])
  })
})

describe('cycleKey', () => {
  it('change au renouvellement → rappels réinitialisés', () => {
    const before = cycleKey({ subscriptionExpiresAt: NOW + 5 * DAY })
    const after = cycleKey({ subscriptionExpiresAt: NOW + 35 * DAY })
    expect(before).not.toBe(after)
  })
})

describe('PROVIDER_SUB', () => {
  it('prix et période conformes à la décision fondateur (9000 FCFA / 30 j)', () => {
    expect(PROVIDER_SUB.price).toBe(9000)
    expect(PROVIDER_SUB.currency).toBe('XOF')
    expect(PROVIDER_SUB.periodDays).toBe(30)
    expect(PROVIDER_SUB.graceDays).toBe(3)
  })
})
