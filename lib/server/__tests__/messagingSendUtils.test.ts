import { describe, expect, it } from 'vitest'
import {
  buildCatalogItemMessageContent,
  buildEventMessageContent,
  clampCatalogDescription,
  isSendableType,
  resolveLastMessageLabel,
  validateMessageContentLength,
} from '../messagingSendUtils'

describe('messagingSendUtils', () => {
  it('reconnaît les types de message autorisés', () => {
    expect(isSendableType('text')).toBe(true)
    expect(isSendableType('catalog_item')).toBe(true)
    expect(isSendableType('system')).toBe(false)
  })

  it('plafonne la description catalogue et construit un payload stable', () => {
    const content = JSON.parse(buildCatalogItemMessageContent({
      providerId: 'u2',
      providerName: 'Studio',
      item: {
        id: 'item-1',
        name: 'Pack DJ',
        description: 'x'.repeat(450),
        price: 120,
        unit: 'soirée',
        category: 'DJ',
        media: [{ url: 'https://img.test/1.jpg', type: 'image' }],
      },
    }))

    expect(content).toMatchObject({
      providerId: 'u2',
      providerName: 'Studio',
      itemId: 'item-1',
      name: 'Pack DJ',
      price: 120,
      unit: 'soirée',
      category: 'DJ',
      image: 'https://img.test/1.jpg',
    })
    expect(content.description.length).toBe(401)
    expect(content.description.endsWith('…')).toBe(true)
  })

  it('construit un payload événement avec le prix minimal', () => {
    const content = JSON.parse(buildEventMessageContent({
      _id: 'event-1',
      name: 'Soirée',
      dateDisplay: 'SAM 22 AOÛT',
      imageUrl: 'https://img.test/event.jpg',
      places: [{ price: 40 }, { price: 15 }, { price: 22 }],
    }))

    expect(content).toEqual({
      id: 'event-1',
      name: 'Soirée',
      date: 'SAM 22 AOÛT',
      price: 15,
      image: 'https://img.test/event.jpg',
    })
  })

  it('valide les limites de taille par type et les libellés d’aperçu', () => {
    expect(validateMessageContentLength('text', '')).toEqual({ ok: false, error: 'empty_message' })
    expect(validateMessageContentLength('text', 'x'.repeat(4001))).toEqual({ ok: false, error: 'message_too_long' })
    expect(validateMessageContentLength('image', 'x'.repeat(2001))).toEqual({ ok: false, error: 'message_too_long' })
    expect(validateMessageContentLength('voice', 'ok')).toEqual({ ok: true })
    expect(resolveLastMessageLabel('text', 'Salut')).toBe('Salut')
    expect(resolveLastMessageLabel('catalog_item', 'ignored')).toBe('Offre prestataire')
    expect(resolveLastMessageLabel('event', 'ignored')).toBe('Événement')
  })

  it('expose le helper de clamp indépendamment', () => {
    expect(clampCatalogDescription('abc')).toBe('abc')
  })
})
