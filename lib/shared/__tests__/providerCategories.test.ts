// Port de scripts/provider-categories.test.mjs (sous-ensemble providerCategories —
// la partie getRequiredDocs/applications.js sera portée avec la phase candidatures).
import { describe, it, expect } from 'vitest'
import {
  PROVIDER_CATEGORIES,
  getPrimaryProviderType,
  getProviderCategories,
  getProviderTypes,
  normalizeProviderType,
  normalizeProviderTypes,
  providerMatchesCategory,
} from '../providerCategories'

describe('providerCategories', () => {
  it('legacy provider types remain readable', () => {
    expect(normalizeProviderType('prestation')).toBe('artiste')
    expect(normalizeProviderType('supermarche')).toBe('food')
    expect(getProviderTypes({ prestataireType: 'photographe' })).toEqual(['photo_video'])
    expect(getProviderTypes({ prestataireType: 'artiste' })).toEqual(['artiste'])
  })

  it('multi-category profiles keep order, remove duplicates and expose a primary type', () => {
    const profile = { prestataireTypes: ['photo_video', 'decoration', 'photo_video'] }
    expect(getProviderTypes(profile)).toEqual(['photo_video', 'decoration'])
    expect(getPrimaryProviderType(profile)).toBe('photo_video')
    expect(getProviderCategories(profile).map((category) => category.id)).toEqual(['photo_video', 'decoration'])
  })

  it('directory filters match every selected activity, not only the primary one', () => {
    const provider = { prestataireType: 'artiste', prestataireTypes: ['artiste', 'communication'] }
    expect(providerMatchesCategory(provider, 'artiste')).toBe(true)
    expect(providerMatchesCategory(provider, 'communication')).toBe(true)
    expect(providerMatchesCategory(provider, 'salle')).toBe(false)
  })

  it('profiles without a category remain valid and fall back to other services', () => {
    expect(normalizeProviderTypes([], null)).toEqual([])
    expect(getProviderTypes({ prestataireTypes: [] })).toEqual(['autre'])
    expect(PROVIDER_CATEGORIES.some((category) => category.id === 'autre')).toBe(true)
  })
})
