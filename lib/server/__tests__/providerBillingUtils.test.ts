import { describe, expect, it } from 'vitest'
import {
  buildProviderBillingContext,
  canChangeProviderBillingRegion,
  deriveDefaultBillingRegionFromApplication,
} from '../provider/providerBillingUtils'

describe('providerBillingUtils', () => {
  it("dérive un défaut 'france' si le pays d'application est absent ou inconnu", () => {
    expect(deriveDefaultBillingRegionFromApplication(undefined)).toBe('france')
    expect(deriveDefaultBillingRegionFromApplication('atlantide')).toBe('france')
  })

  it('normalise le pays d’application quand il est reconnu', () => {
    expect(deriveDefaultBillingRegionFromApplication('Togo')).toBe('togo')
    expect(deriveDefaultBillingRegionFromApplication('fr')).toBe('france')
    expect(deriveDefaultBillingRegionFromApplication('Sénégal')).toBe('senegal')
    expect(deriveDefaultBillingRegionFromApplication({ name: 'Bénin' })).toBe('benin')
  })

  it('dérive correctement la possibilité de changement selon l’abonnement', () => {
    expect(canChangeProviderBillingRegion(true)).toBe(false)
    expect(canChangeProviderBillingRegion(false)).toBe(true)
    expect(canChangeProviderBillingRegion(null)).toBe(true)
    expect(canChangeProviderBillingRegion(undefined)).toBe(true)
  })

  it('construit un contexte de facturation stable et normalisé', () => {
    expect(buildProviderBillingContext({ billingRegionId: 'Togo', prestataireSubActive: true })).toEqual({
      billingRegionId: 'togo',
      currency: 'XOF',
      canChange: false,
    })

    expect(buildProviderBillingContext({ billingRegionId: '', prestataireSubActive: false })).toEqual({
      billingRegionId: 'france',
      currency: 'EUR',
      canChange: true,
    })

    expect(buildProviderBillingContext({ billingRegionId: { id: 'sn' }, prestataireSubActive: null })).toEqual({
      billingRegionId: 'senegal',
      currency: 'XOF',
      canChange: true,
    })
  })
})
