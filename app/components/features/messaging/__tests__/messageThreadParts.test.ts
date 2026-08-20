import { describe, expect, it } from 'vitest'
import { messageTypeLabel } from '../MessageThreadParts'

describe('MessageThreadParts helpers', () => {
  it('retourne des libellés lisibles pour les types de message spéciaux', () => {
    expect(messageTypeLabel('image')).toBe('Photo')
    expect(messageTypeLabel('voice')).toBe('Message vocal')
    expect(messageTypeLabel('poll')).toBe('Sondage')
    expect(messageTypeLabel('event_poll')).toBe('Sondage')
    expect(messageTypeLabel('story')).toBe('Article')
    expect(messageTypeLabel('event')).toBe('Événement')
    expect(messageTypeLabel('catalog_item')).toBe('Offre prestataire')
  })

  it('retourne une chaîne vide pour le texte brut et les types système', () => {
    expect(messageTypeLabel('text')).toBe('')
    expect(messageTypeLabel('system')).toBe('')
  })
})
