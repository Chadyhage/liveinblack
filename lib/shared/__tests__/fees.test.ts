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
  it('5% + 300 FCFA par billet', () => {
    // 5000 FCFA → 5% = 250 + 300 = 550
    expect(computeTicketFeeXOF(5000, 1)).toBe(550)
  })
  it('plafonne à 1500 FCFA/billet', () => {
    // 100000 FCFA → 5% = 5000 + 300 = 5300, plafonné à 1500
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
