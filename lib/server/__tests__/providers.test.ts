// Test UNITAIRE (pas de base Mongo requise) pour lib/server/providers.ts —
// isProviderVisible (règle de visibilité de la fiche publique prestataire).
// isNonGhost (filtrage "profil fantôme" de l'annuaire) n'est pas exportée :
// couverte indirectement par listPublicProviders dans providers.integration.test.ts.
import { describe, it, expect } from 'vitest'
import { isProviderVisible } from '../providers'

describe('isProviderVisible', () => {
  it('refuse si aucun profil (provider null/undefined)', () => {
    expect(isProviderVisible(null)).toBe(false)
    expect(isProviderVisible(undefined)).toBe(false)
  })

  it('refuse un profil sans abonnement actif pour un visiteur anonyme', () => {
    expect(isProviderVisible({ subscriptionActive: false }, null)).toBe(false)
    expect(isProviderVisible({ subscriptionActive: false })).toBe(false)
  })

  it('autorise un profil avec abonnement actif pour n’importe quel visiteur', () => {
    expect(isProviderVisible({ subscriptionActive: true }, null)).toBe(true)
    expect(isProviderVisible({ subscriptionActive: true }, { activeRole: 'client', id: 'someone-else' }, 'owner-1')).toBe(true)
  })

  it('un agent voit TOUJOURS le profil, abonnement actif ou non', () => {
    expect(isProviderVisible({ subscriptionActive: false }, { activeRole: 'agent' })).toBe(true)
  })

  it('le propriétaire voit TOUJOURS sa propre page, abonnement actif ou non', () => {
    expect(isProviderVisible({ subscriptionActive: false }, { id: 'owner-1' }, 'owner-1')).toBe(true)
  })

  it('un visiteur connecté qui n’est ni agent ni le propriétaire reste soumis à subscriptionActive', () => {
    expect(isProviderVisible({ subscriptionActive: false }, { activeRole: 'client', id: 'someone-else' }, 'owner-1')).toBe(false)
  })

  it('ne confond pas "id fourni mais ownerUserId absent" avec une correspondance propriétaire', () => {
    // Si `ownerUserId` n'est pas passé au tout, le check propriétaire ne
    // doit jamais accidentellement passer via une comparaison undefined===undefined.
    expect(isProviderVisible({ subscriptionActive: false }, { id: 'owner-1' })).toBe(false)
  })
})
