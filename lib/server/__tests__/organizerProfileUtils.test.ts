import { describe, expect, it } from 'vitest'
import { reorderOrganizerMediaList, resolveOrganizerZones, toOrganizerProfileView, toOrganizerSocialLinks } from '../organizerProfileUtils'

describe('organizerProfileUtils', () => {
  it('reconstruit tous les social links sans référence circulaire ni trou', () => {
    const links = toOrganizerSocialLinks({ instagram: '@liveinblack' })
    expect(links.instagram).toBe('@liveinblack')
    expect(Object.values(links).every((value) => typeof value === 'string')).toBe(true)
  })

  it('sérialise la vue profil avec fallbacks stables', () => {
    expect(
      toOrganizerProfileView({
        publicName: 'Le Loft',
        slug: 'le-loft',
        socialLinks: { instagram: '@loft' },
        media: [{ id: 'm1', url: 'https://x.test/1.jpg' }],
      })
    ).toEqual({
      publicName: 'Le Loft',
      slug: 'le-loft',
      city: '',
      country: '',
      regionId: '',
      shortDescription: '',
      socialLinks: expect.objectContaining({ instagram: '@loft' }),
      zonesIntervention: [],
      avatarUrl: null,
      bannerUrl: null,
      status: 'draft',
      isVerified: false,
      followersCount: 0,
      totalEventsCount: 0,
      viewsCount: 0,
      media: [
        {
          id: 'm1',
          url: 'https://x.test/1.jpg',
          type: 'image',
          title: '',
          description: '',
          eventId: null,
          visibility: 'public',
          displayOrder: 0,
        },
      ],
    })
  })

  it('sérialise proprement les champs nuls et conserve les médias sans les enrichir bizarrement', () => {
    expect(
      toOrganizerProfileView({
        publicName: 'Club Nova',
        slug: 'club-nova',
        city: null,
        country: null,
        regionId: null,
        shortDescription: null,
        socialLinks: null,
        zonesIntervention: null,
        avatarUrl: undefined,
        bannerUrl: undefined,
        status: null,
        isVerified: null,
        followersCount: null,
        totalEventsCount: null,
        viewsCount: null,
        media: [
          { id: 'm2', url: 'https://x.test/2.mp4', type: 'video', visibility: 'hidden', displayOrder: 3, title: null, description: null, eventId: undefined },
        ],
      })
    ).toEqual({
      publicName: 'Club Nova',
      slug: 'club-nova',
      city: '',
      country: '',
      regionId: '',
      shortDescription: '',
      socialLinks: expect.any(Object),
      zonesIntervention: [],
      avatarUrl: null,
      bannerUrl: null,
      status: 'draft',
      isVerified: false,
      followersCount: 0,
      totalEventsCount: 0,
      viewsCount: 0,
      media: [
        {
          id: 'm2',
          url: 'https://x.test/2.mp4',
          type: 'video',
          title: '',
          description: '',
          eventId: null,
          visibility: 'hidden',
          displayOrder: 3,
        },
      ],
    })
  })

  it('garantit que la zone d’ancrage reste présente sauf si international est choisi', () => {
    expect(resolveOrganizerZones('togo', ['benin'])).toEqual(['togo', 'benin'])
    expect(resolveOrganizerZones('togo', ['benin', 'international'])).toEqual(['international'])
    expect(resolveOrganizerZones('togo', ['benin', 'togo', 'Bénin'])).toEqual(['benin', 'togo'])
    expect(resolveOrganizerZones(null, ['Bénin', 'benin'])).toEqual(['benin'])
  })

  it('réordonne les médias et recalcule displayOrder', () => {
    const result = reorderOrganizerMediaList(
      [
        { id: 'a', displayOrder: 0 },
        { id: 'b', displayOrder: 1 },
      ],
      ['b', 'a']
    )

    expect(result).toEqual({
      ok: true,
      media: [
        { id: 'b', displayOrder: 0 },
        { id: 'a', displayOrder: 1 },
      ],
    })
  })

  it('rejette un ordre incomplet ou invalide', () => {
    expect(reorderOrganizerMediaList([{ id: 'a', displayOrder: 0 }], ['missing'])).toEqual({
      ok: false,
      error: 'invalid_order',
    })
    expect(
      reorderOrganizerMediaList(
        [
          { id: 'a', displayOrder: 0 },
          { id: 'b', displayOrder: 1 },
        ],
        ['a', 'a']
      )
    ).toEqual({
      ok: false,
      error: 'invalid_order',
    })
  })
})
