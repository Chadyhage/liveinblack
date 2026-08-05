// Port fidèle des tests de lib/providerBillingRegion.js — normalisation du
// pays de facturation prestataire + dérivation de la devise (rail de paiement).
import { describe, it, expect } from 'vitest'
import { normalizeProviderBillingRegion, providerBillingCurrency } from '../providerBillingRegion'

describe('normalizeProviderBillingRegion', () => {
  it('reconnaît un id de région tel quel', () => {
    expect(normalizeProviderBillingRegion('togo')).toBe('togo')
    expect(normalizeProviderBillingRegion('france')).toBe('france')
  })
  it('reconnaît un nom accentué, insensible à la casse', () => {
    expect(normalizeProviderBillingRegion('Côte d’Ivoire')).toBe('cote-ivoire')
    expect(normalizeProviderBillingRegion('BÉNIN')).toBe('benin')
  })
  it('reconnaît les indicatifs pays ISO-2 courts', () => {
    expect(normalizeProviderBillingRegion('fr')).toBe('france')
    expect(normalizeProviderBillingRegion('tg')).toBe('togo')
    expect(normalizeProviderBillingRegion('ci')).toBe('cote-ivoire')
  })
  it('reconnaît le code région (FR/TG/...)', () => {
    expect(normalizeProviderBillingRegion('SN')).toBe('senegal')
  })
  it('renvoie une chaîne vide pour une valeur inconnue ou vide', () => {
    expect(normalizeProviderBillingRegion('atlantide')).toBe('')
    expect(normalizeProviderBillingRegion('')).toBe('')
    expect(normalizeProviderBillingRegion(null)).toBe('')
    expect(normalizeProviderBillingRegion(undefined)).toBe('')
  })
})

describe('providerBillingCurrency', () => {
  it('France → EUR', () => {
    expect(providerBillingCurrency('france')).toBe('EUR')
  })
  it('zone UEMOA → XOF', () => {
    expect(providerBillingCurrency('togo')).toBe('XOF')
    expect(providerBillingCurrency('benin')).toBe('XOF')
    expect(providerBillingCurrency('mali')).toBe('XOF')
  })
  it('valeur inconnue → EUR par défaut', () => {
    expect(providerBillingCurrency('atlantide')).toBe('EUR')
  })
})
