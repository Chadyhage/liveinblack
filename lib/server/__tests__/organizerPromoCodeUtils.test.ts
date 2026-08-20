import { describe, expect, it } from 'vitest'
import {
  hasOnlyKnownPromoPlaceIds,
  minPositivePlacePrice,
  normalizePromoPlaceIds,
  scopedPromoPlaces,
  toPromoCodeView,
} from '../organizerPromoCodeUtils'

describe('organizerPromoCodeUtils', () => {
  it('normalise les placeIds promo', () => {
    expect(normalizePromoPlaceIds([' vip ', '', 'std', 'vip'])).toEqual(['vip', 'std', 'vip'])
    expect(normalizePromoPlaceIds(undefined)).toEqual([])
    expect(normalizePromoPlaceIds(null)).toEqual([])
  })

  it('vérifie que les places ciblées existent', () => {
    const eventPlaceIds = new Set(['vip', 'std'])
    expect(hasOnlyKnownPromoPlaceIds(eventPlaceIds, ['vip'])).toBe(true)
    expect(hasOnlyKnownPromoPlaceIds(eventPlaceIds, ['ghost'])).toBe(false)
  })

  it('restreint les places au périmètre du code promo', () => {
    const places = [{ id: 'vip', price: 50 }, { id: 'std', price: 20 }]
    expect(scopedPromoPlaces(places, ['vip'])).toEqual([{ id: 'vip', price: 50 }])
    expect(scopedPromoPlaces(places, ['vip', 'vip'])).toEqual([{ id: 'vip', price: 50 }])
    expect(scopedPromoPlaces(places, [])).toEqual(places)
  })

  it('trouve le prix positif minimal', () => {
    expect(minPositivePlacePrice([{ price: 50 }, { price: 20 }, { price: 0 }])).toBe(20)
    expect(minPositivePlacePrice([{ price: Number.NaN }, { price: -10 }, { price: 15 }])).toBe(15)
    expect(minPositivePlacePrice([{ price: 0 }])).toBe(0)
  })

  it('convertit un promo doc en vue stable', () => {
    expect(toPromoCodeView({
      code: 'VIP20',
      type: 'percent',
      value: 20,
      maxUses: 100,
      usedCount: 4,
      active: true,
      expiresAt: new Date('2026-08-25T00:00:00.000Z'),
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      placeIds: ['vip'],
    } as never)).toEqual({
      code: 'VIP20',
      type: 'percent',
      value: 20,
      maxUses: 100,
      usedCount: 4,
      active: true,
      expiresAt: '2026-08-25T00:00:00.000Z',
      createdAt: '2026-08-20T10:00:00.000Z',
      placeIds: ['vip'],
    })

    expect(toPromoCodeView({
      code: 'GLOBAL10',
      type: 'fixed',
      value: 10,
      maxUses: null,
      usedCount: null,
      active: null,
      expiresAt: null,
      createdAt: null,
      placeIds: [],
    } as never)).toEqual({
      code: 'GLOBAL10',
      type: 'fixed',
      value: 10,
      maxUses: 0,
      usedCount: 0,
      active: true,
      expiresAt: null,
      createdAt: '',
      placeIds: undefined,
    })
  })
})
