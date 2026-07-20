import { describe, it, expect } from 'vitest'
import { computePayoutGapLabel } from '../organizerPayoutGaps'

describe('computePayoutGapLabel', () => {
  it("renvoie une chaîne vide quand tout l'encaissement est configuré", () => {
    const label = computePayoutGapLabel(
      [{ currency: 'EUR', region: 'France', cancelled: false }],
      { stripeChargesEnabled: true, momos: {} }
    )
    expect(label).toBe('')
  })

  it('ignore les événements annulés', () => {
    const label = computePayoutGapLabel(
      [{ currency: 'EUR', region: 'France', cancelled: true }],
      { stripeChargesEnabled: false, momos: {} }
    )
    expect(label).toBe('')
  })

  it("signale le compte bancaire manquant pour un événement EUR sans Stripe Connect actif", () => {
    const label = computePayoutGapLabel(
      [{ currency: 'EUR', region: 'France', cancelled: false }],
      { stripeChargesEnabled: false, momos: {} }
    )
    expect(label).toBe('ton compte bancaire (événements en euros)')
  })

  it('signale un numéro Mobile Money manquant par pays, sans doublon', () => {
    const label = computePayoutGapLabel(
      [
        { currency: 'XOF', region: 'Togo', cancelled: false },
        { currency: 'XOF', region: 'Togo', cancelled: false },
        { currency: 'XOF', region: 'Bénin', cancelled: false },
      ],
      { stripeChargesEnabled: true, momos: {} }
    )
    expect(label).toBe('un numéro Mobile Money pour Togo et un numéro Mobile Money pour Bénin')
  })

  it('ne signale pas un pays dont le numéro est déjà configuré', () => {
    const label = computePayoutGapLabel(
      [{ currency: 'XOF', region: 'Togo', cancelled: false }],
      { stripeChargesEnabled: true, momos: { tg: '+22890000000' } }
    )
    expect(label).toBe('')
  })

  it('combine les deux manques (EUR + XOF) dans un seul libellé', () => {
    const label = computePayoutGapLabel(
      [
        { currency: 'EUR', region: 'France', cancelled: false },
        { currency: 'XOF', region: 'Togo', cancelled: false },
      ],
      { stripeChargesEnabled: false, momos: {} }
    )
    expect(label).toBe('ton compte bancaire (événements en euros) et un numéro Mobile Money pour Togo')
  })
})
