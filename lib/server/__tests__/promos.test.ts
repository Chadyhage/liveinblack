// Port du test scripts/promos.test.mjs (legacy) — même règles métier, mêmes
// cas, portés vers l'API Mongoose (findOne().lean() / updateOne $inc) au lieu
// de l'API Firestore (doc().get() / transaction).
import { describe, it, expect } from 'vitest'
import { resolvePromo, promoUnitDiscount, normalizePromoCode } from '../promos'
import type { PromoCodeModel } from '../../models/PromoCode'

type FakePromo = Record<string, unknown>

function fakePromoModel(items: FakePromo[]): PromoCodeModel {
  return {
    findOne(filter: Record<string, unknown>) {
      const doc = items.find((p) => String(p.eventId) === String(filter.eventId) && String(p.code) === String(filter.code)) || null
      return { lean: async () => doc }
    },
  } as unknown as PromoCodeModel
}

describe('resolvePromo', () => {
  it('code inconnu refusé', async () => {
    const PromoCode = fakePromoModel([{ eventId: 'e1', code: 'WELCOME', type: 'percent', value: 20, maxUses: 10, usedCount: 0 }])
    const r = await resolvePromo(PromoCode, 'e1', 'NOPE', 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('unknown')
  })

  it('#69 une commande ne peut pas dépasser les utilisations restantes', async () => {
    const PromoCode = fakePromoModel([{ eventId: 'e1', code: 'SOLO', type: 'percent', value: 50, maxUses: 1, usedCount: 0 }])
    const bulk = await resolvePromo(PromoCode, 'e1', 'SOLO', 5)
    expect(bulk.ok).toBe(false)
    expect(!bulk.ok && bulk.reason).toBe('insufficient_uses')
    const one = await resolvePromo(PromoCode, 'e1', 'SOLO', 1)
    expect(one.ok).toBe(true)
  })

  it('plafond partiel (3 restantes → 3 ok, 4 refusé)', async () => {
    const PromoCode = fakePromoModel([{ eventId: 'e1', code: 'PROMO', type: 'fixed', value: 5, maxUses: 10, usedCount: 7 }])
    expect((await resolvePromo(PromoCode, 'e1', 'PROMO', 3)).ok).toBe(true)
    expect((await resolvePromo(PromoCode, 'e1', 'PROMO', 4)).ok).toBe(false)
  })

  it('maxUses 0 = illimité', async () => {
    const PromoCode = fakePromoModel([{ eventId: 'e1', code: 'ILLIMITE', type: 'percent', value: 10, maxUses: 0, usedCount: 9999 }])
    expect((await resolvePromo(PromoCode, 'e1', 'ILLIMITE', 20)).ok).toBe(true)
  })

  it('code épuisé refusé', async () => {
    const PromoCode = fakePromoModel([{ eventId: 'e1', code: 'DONE', type: 'percent', value: 10, maxUses: 5, usedCount: 5 }])
    const r = await resolvePromo(PromoCode, 'e1', 'DONE', 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('exhausted')
  })

  it('inactif / expiré refusés', async () => {
    const inactive = fakePromoModel([{ eventId: 'e1', code: 'OFF', type: 'percent', value: 10, active: false }])
    const rInactive = await resolvePromo(inactive, 'e1', 'OFF', 1)
    expect(!rInactive.ok && rInactive.reason).toBe('inactive')

    const expired = fakePromoModel([{ eventId: 'e1', code: 'OLD', type: 'percent', value: 10, expiresAt: '2000-01-01T00:00:00Z' }])
    const rExpired = await resolvePromo(expired, 'e1', 'OLD', 1)
    expect(!rExpired.ok && rExpired.reason).toBe('expired')
  })
})

describe('promoUnitDiscount', () => {
  it('percent et fixed, bornés au prix du billet', () => {
    expect(promoUnitDiscount({ type: 'percent', value: 20 } as never, 2000, 100)).toBe(400) // 20 % de 20 €
    expect(promoUnitDiscount({ type: 'fixed', value: 5 } as never, 2000, 100)).toBe(500) // 5 € de 20 €
    expect(promoUnitDiscount({ type: 'fixed', value: 999 } as never, 2000, 100)).toBe(2000) // jamais > prix
    expect(promoUnitDiscount({ type: 'fixed', value: 500 } as never, 5000, 1)).toBe(500) // XOF entiers
  })
})

describe('normalizePromoCode', () => {
  it('trim, majuscules, sans espaces', () => {
    expect(normalizePromoCode('  we l come ')).toBe('WELCOME')
  })
})
