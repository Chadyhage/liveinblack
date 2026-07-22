import { describe, expect, it } from 'vitest'
import { parseLegacyCloudinaryAssetUrl } from '../cloudinaryLegacyUrl'

describe('parseLegacyCloudinaryAssetUrl', () => {
  it('extrait un identifiant image Cloudinary sans exposer la version', () => {
    expect(
      parseLegacyCloudinaryAssetUrl(
        'https://res.cloudinary.com/liveinblack/image/upload/v1710000000/applications/user/id/card.png',
        'liveinblack'
      )
    ).toEqual({
      cloudName: 'liveinblack',
      resourceType: 'image',
      format: 'png',
      publicIdCandidates: ['applications/user/id/card'],
    })
  })

  it('essaie les deux conventions Cloudinary pour un fichier raw', () => {
    expect(
      parseLegacyCloudinaryAssetUrl(
        'https://res.cloudinary.com/liveinblack/raw/upload/v1710000000/applications/user/id/statuts.pdf'
      )?.publicIdCandidates
    ).toEqual(['applications/user/id/statuts.pdf', 'applications/user/id/statuts'])
  })

  it('rejette un autre hébergeur, cloud ou type de livraison', () => {
    expect(parseLegacyCloudinaryAssetUrl('https://evil.example/card.png')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/other/image/upload/v1/card.png', 'liveinblack')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/liveinblack/image/authenticated/v1/card.png')).toBeNull()
  })
})
