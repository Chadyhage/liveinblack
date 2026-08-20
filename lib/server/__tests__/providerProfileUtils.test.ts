import { describe, expect, it } from 'vitest'
import {
  resolveCatalogCurrency,
  resolveProviderZones,
  sanitizeProviderSocialLinks,
  toProviderCatalogView,
  toProviderProfileView,
  toProviderSocialLinks,
} from '../providerProfileUtils'

describe('providerProfileUtils', () => {
  it('reconstruit tous les social links en chaînes sûres', () => {
    const links = toProviderSocialLinks({ instagram: '@djkayo' })
    expect(links.instagram).toBe('@djkayo')
    expect(Object.values(links).every((value) => typeof value === 'string')).toBe(true)
  })

  it('sérialise le catalogue avec fallbacks stables', () => {
    expect(toProviderCatalogView([{ id: '1', name: 'Set DJ', media: [{ url: 'https://x.test/a.jpg' }] }])).toEqual([
      {
        id: '1',
        name: 'Set DJ',
        description: '',
        price: null,
        currency: 'EUR',
        unit: '',
        category: '',
        available: true,
        media: [{ url: 'https://x.test/a.jpg', type: 'image' }],
        createdAt: expect.any(String),
      },
    ])
  })

  it('sérialise le catalogue avec médias vidéo, disponibilité false et date stable', () => {
    expect(
      toProviderCatalogView([
        {
          id: '2',
          name: 'Pack lumière',
          available: false,
          createdAt: '2026-08-20T10:00:00.000Z',
          media: [{ url: 'https://x.test/a.mp4', type: 'video' }],
        },
      ])
    ).toEqual([
      {
        id: '2',
        name: 'Pack lumière',
        description: '',
        price: null,
        currency: 'EUR',
        unit: '',
        category: '',
        available: false,
        media: [{ url: 'https://x.test/a.mp4', type: 'video' }],
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    ])
  })

  it('sérialise la vue profil avec fallbacks et catalogue plain object', () => {
    const view = toProviderProfileView({
      userId: 'u1',
      name: 'DJ Kayo',
      socialLinks: { instagram: '@djkayo' },
      catalog: [{ id: '1', name: 'Set DJ' }],
    })
    expect(view.userId).toBe('u1')
    expect(view.name).toBe('DJ Kayo')
    expect(view.socialLinks.instagram).toBe('@djkayo')
    expect(view.catalog).toHaveLength(1)
    expect(view.catalog[0].name).toBe('Set DJ')
    expect(view.subscriptionStatus).toBe('none')
  })

  it('sérialise proprement les champs nuls, dates et tableaux absents', () => {
    const view = toProviderProfileView({
      userId: 'u2',
      name: 'Studio Nova',
      headline: null,
      description: null,
      city: null,
      regionId: null,
      country: null,
      zonesIntervention: null,
      website: null,
      socialLinks: null,
      photoUrl: undefined,
      coverUrl: undefined,
      prestataireType: null,
      prestataireTypes: null,
      phone: null,
      catalogCurrency: null,
      subscriptionActive: null,
      subscriptionStatus: null,
      subscriptionExpiresAt: '2026-08-20T12:00:00.000Z',
      gracePeriodEndsAt: null,
      ratingAvg: null,
      ratingCount: null,
      catalog: null,
    })

    expect(view).toEqual({
      userId: 'u2',
      name: 'Studio Nova',
      headline: '',
      description: '',
      city: '',
      regionId: '',
      country: '',
      zonesIntervention: [],
      website: '',
      socialLinks: expect.any(Object),
      photoUrl: null,
      coverUrl: null,
      prestataireType: 'autre',
      prestataireTypes: [],
      phone: '',
      catalogCurrency: 'EUR',
      subscriptionActive: false,
      subscriptionStatus: 'none',
      subscriptionExpiresAt: '2026-08-20T12:00:00.000Z',
      gracePeriodEndsAt: null,
      ratingAvg: 0,
      ratingCount: 0,
      catalog: [],
    })
  })

  it('garantit le pays de base dans les zones sauf si international est choisi', () => {
    expect(resolveProviderZones('togo', ['senegal'])).toEqual(['togo', 'senegal'])
    expect(resolveProviderZones('togo', ['senegal', 'international'])).toEqual(['international'])
    expect(resolveProviderZones('togo', ['senegal', 'togo', 'Sénégal'])).toEqual(['senegal', 'togo'])
  })

  it('nettoie les liens sociaux et synchronise les URLs valides', () => {
    const links = sanitizeProviderSocialLinks({ website: 'https://djkayo.com', instagram: '@djkayo' })
    expect(links.website).toBe('https://djkayo.com')
    expect(links.instagram).toBe('https://instagram.com/djkayo')
    expect(sanitizeProviderSocialLinks({ linkedin: 'bad\u0000value', website: 'notaurl' })).toEqual({
      linkedin: '',
      website: 'https://notaurl',
    })
  })

  it('préserve le quirk legacy de devise catalogue', () => {
    expect(resolveCatalogCurrency('XOF', 'EUR')).toBe('XOF')
    expect(resolveCatalogCurrency('EUR', 'XOF')).toBe('XOF')
    expect(resolveCatalogCurrency(undefined, 'EUR')).toBe('EUR')
  })
})
