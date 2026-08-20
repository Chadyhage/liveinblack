import { describe, expect, it } from 'vitest'
import {
  buildRefundWindowCloseDate,
  grossRefundMajor,
  isPastOrInvalidEventDate,
  resolveRefundWindowDays,
} from '../organizerEventLifecycleUtils'

describe('organizerEventLifecycleUtils', () => {
  it('calcule le remboursement brut hors frais pour EUR et XOF', () => {
    expect(grossRefundMajor({
      isTable: false,
      qty: 2,
      unitPriceMinor: 2000,
      preorders: [{ price: 5, qty: 2 }],
      currency: 'EUR',
    } as never)).toBe(40.1)

    expect(grossRefundMajor({
      isTable: true,
      qty: 4,
      unitPriceMinor: 10000,
      preorders: [{ price: 2000, qty: 1 }],
      currency: 'XOF',
    } as never)).toBe(12000)

    expect(grossRefundMajor({
      isTable: false,
      qty: 1,
      unitPriceMinor: -500,
      preorders: [],
      currency: 'EUR',
    } as never)).toBe(0)
  })

  it('résout une fenêtre de remboursement valide avec fallback', () => {
    expect(resolveRefundWindowDays(10)).toBe(10)
    expect(resolveRefundWindowDays(0)).toBe(7)
    expect(resolveRefundWindowDays(-3)).toBe(7)
    expect(resolveRefundWindowDays(undefined)).toBe(7)
  })

  it('construit la date de fin de fenêtre depuis now', () => {
    const now = new Date('2026-08-20T12:00:00.000Z').getTime()
    expect(buildRefundWindowCloseDate(now, 2).toISOString()).toBe('2026-08-22T12:00:00.000Z')
    expect(buildRefundWindowCloseDate(now, undefined).toISOString()).toBe('2026-08-27T12:00:00.000Z')
  })

  it('détecte une date invalide ou passée pour un report', () => {
    const now = new Date('2026-08-20T12:00:00.000Z').getTime()
    expect(isPastOrInvalidEventDate('2026-08-19', '12:00', now)).toBe(true)
    expect(isPastOrInvalidEventDate('bad-date', '12:00', now)).toBe(true)
    expect(isPastOrInvalidEventDate('2026-08-20', undefined, now)).toBe(true)
    expect(isPastOrInvalidEventDate('2026-08-21', '12:00', now)).toBe(false)
    expect(isPastOrInvalidEventDate('2026-08-21', '   ', now)).toBe(false)
  })
})
