import { describe, it, expect } from 'vitest'
import { computeTicketFeeCents, computeTicketFeeXOF, isStripeConnectCountry, resolveCountryISO } from '../fees'

describe('computeTicketFeeCents', () => {
  it('5% + 0,49€ par billet, exemple simple', () => {
    // 10,00€ → 5% = 50c + 49c = 99c
    expect(computeTicketFeeCents(1000, 1)).toBe(99)
  })
  it('plafonne à 2,50€/billet', () => {
    // 100,00€ → 5% = 500c + 49c = 549c, plafonné à 250c
    expect(computeTicketFeeCents(10000, 1)).toBe(250)
  })
  it('multiplie par la quantité', () => {
    expect(computeTicketFeeCents(1000, 3)).toBe(99 * 3)
  })
  it('gratuit si prix ou quantité nulle', () => {
    expect(computeTicketFeeCents(0, 5)).toBe(0)
    expect(computeTicketFeeCents(1000, 0)).toBe(0)
  })
})

describe('computeTicketFeeXOF', () => {
  // Table d'exemples officielle (LIVE_IN_BLACK_Modele_Economique_CORRIGE.docx
  // §1) : 5% du prix, plancher 200 FCFA, plafond 1500 FCFA par admission —
  // PAS un montant fixe ajouté au pourcentage.
  it('applique le plancher de 200 FCFA sous 4000 FCFA', () => {
    expect(computeTicketFeeXOF(1000, 1)).toBe(200) // 5% = 50 < 200
    expect(computeTicketFeeXOF(3000, 1)).toBe(200) // 5% = 150 < 200
    expect(computeTicketFeeXOF(4000, 1)).toBe(200) // 5% = 200, pile le plancher
  })
  it('applique le pourcentage brut entre le plancher et le plafond', () => {
    expect(computeTicketFeeXOF(5000, 1)).toBe(250)
    expect(computeTicketFeeXOF(10000, 1)).toBe(500)
    expect(computeTicketFeeXOF(20000, 1)).toBe(1000)
    expect(computeTicketFeeXOF(30000, 1)).toBe(1500) // pile le plafond
  })
  it('plafonne à 1500 FCFA/admission au-delà de 30000 FCFA', () => {
    expect(computeTicketFeeXOF(50000, 1)).toBe(1500)
    expect(computeTicketFeeXOF(100000, 1)).toBe(1500)
  })
  it('montants entiers (pas de décimales XOF)', () => {
    expect(Number.isInteger(computeTicketFeeXOF(4999, 1))).toBe(true)
  })
})

describe('isStripeConnectCountry', () => {
  it('accepte les pays Connect (France)', () => {
    expect(isStripeConnectCountry('FR')).toBe(true)
    expect(isStripeConnectCountry('fr')).toBe(true)
  })
  it('refuse les pays UEMOA (hors Connect, route FedaPay)', () => {
    expect(isStripeConnectCountry('TG')).toBe(false)
    expect(isStripeConnectCountry('SN')).toBe(false)
    expect(isStripeConnectCountry('CI')).toBe(false)
  })
  it('refuse une valeur vide', () => {
    expect(isStripeConnectCountry(null)).toBe(false)
    expect(isStripeConnectCountry('')).toBe(false)
  })
})

describe('resolveCountryISO', () => {
  it('reconnaît un code ISO-2 direct', () => {
    expect(resolveCountryISO({ country: 'fr' })).toBe('FR')
  })
  it('reconnaît un nom de pays', () => {
    expect(resolveCountryISO({ country: 'Togo' })).toBe('TG')
    expect(resolveCountryISO({ country: "Côte d'Ivoire" })).toBe('CI')
  })
  it('retombe sur l\'indicatif téléphonique si le pays est inconnu', () => {
    expect(resolveCountryISO({ phoneCode: '+228' })).toBe('TG')
  })
  it('renvoie null si rien ne correspond', () => {
    expect(resolveCountryISO({})).toBeNull()
  })
})
