import { describe, expect, it } from 'vitest'
import {
  cancellationOptionDeadline,
  computeCancellationOptionFeeXOF,
  computeRefundableMinor,
  decryptRefundPickupCode,
  encryptRefundPickupCode,
  isBeforeCancellationOptionDeadline,
  maskPaymentDestination,
} from '../refundPolicy'

describe('refundPolicy', () => {
  it('calcule le prix de l’option à 10% avec seuil 5 000 FCFA et plafond 5 000', () => {
    expect(computeCancellationOptionFeeXOF(4_999, 1)).toBe(0)
    expect(computeCancellationOptionFeeXOF(10_000, 1)).toBe(1_000)
    expect(computeCancellationOptionFeeXOF(60_000, 1)).toBe(5_000)
  })

  it('ferme l’option strictement 48 heures avant la fermeture de billetterie', () => {
    const closing = new Date('2026-09-10T20:00:00.000Z')
    expect(cancellationOptionDeadline(closing)?.toISOString()).toBe('2026-09-08T20:00:00.000Z')
    expect(isBeforeCancellationOptionDeadline(closing, new Date('2026-09-08T19:59:59.000Z'))).toBe(true)
    expect(isBeforeCancellationOptionDeadline(closing, new Date('2026-09-08T20:00:00.000Z'))).toBe(false)
  })

  it('sépare remboursement option volontaire et remboursement événement/report', () => {
    const order = {
      isTable: false,
      qty: 1,
      unitPriceMinor: 10_000,
      feeMinor: 500,
      cancellationProtectionFeeMinor: 1_000,
      preorders: [{ price: 1_500, qty: 1 }],
    }
    expect(computeRefundableMinor(order, 'cancellation_option')).toBe(10_000)
    expect(computeRefundableMinor(order, 'event_cancelled')).toBe(13_000)
    expect(computeRefundableMinor(order, 'postponed_declined')).toBe(13_000)
  })

  it('chiffre les codes de retrait et masque les destinations sensibles', () => {
    const encrypted = encryptRefundPickupCode('ABC-123-SECRET')
    expect(encrypted).not.toContain('ABC-123-SECRET')
    expect(decryptRefundPickupCode(encrypted)).toBe('ABC-123-SECRET')
    expect(maskPaymentDestination('+229 97 12 34 56')).toBe('+229••••56')
  })
})
