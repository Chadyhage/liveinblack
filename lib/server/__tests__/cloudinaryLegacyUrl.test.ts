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

  it('accepte aussi une URL sans segment de version explicite', () => {
    expect(
      parseLegacyCloudinaryAssetUrl(
        'https://res.cloudinary.com/liveinblack/image/upload/applications/user/id/card.png',
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

  it('décode les segments encodés dans le public id', () => {
    expect(
      parseLegacyCloudinaryAssetUrl(
        'https://res.cloudinary.com/liveinblack/image/upload/v1710000000/folder%20name/card%20final.jpg',
        'liveinblack'
      )
    ).toEqual({
      cloudName: 'liveinblack',
      resourceType: 'image',
      format: 'jpg',
      publicIdCandidates: ['folder name/card final'],
    })
  })

  it('rejette un autre hébergeur, cloud ou type de livraison', () => {
    expect(parseLegacyCloudinaryAssetUrl('https://evil.example/card.png')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/other/image/upload/v1/card.png', 'liveinblack')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/liveinblack/image/authenticated/v1/card.png')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/liveinblack/image/upload/')).toBeNull()
    expect(parseLegacyCloudinaryAssetUrl('https://res.cloudinary.com/liveinblack/image/upload/v1710000000/folder/no-extension', 'liveinblack')).toBeNull()
  })
})
