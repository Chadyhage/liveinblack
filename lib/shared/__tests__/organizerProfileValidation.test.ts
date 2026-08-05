// Tests UNITAIRES purs (aucune base) pour lib/shared/organizerProfileValidation.ts
// (#7 phase organisateur — port de la validation de slug de src/utils/organizers.js).
import { describe, it, expect } from 'vitest'
import { slugifyOrganizer, validateOrganizerSlugFormat, RESERVED_ORGANIZER_SLUGS } from '../organizerProfileValidation'

describe('slugifyOrganizer', () => {
  it('normalise accents, espaces et casse', () => {
    expect(slugifyOrganizer('Café Événement Étoilé')).toBe('cafe-evenement-etoile')
  })

  it('tronque à 54 caractères', () => {
    const long = 'a'.repeat(80)
    expect(slugifyOrganizer(long)).toHaveLength(54)
  })

  it('retire les tirets en début/fin', () => {
    expect(slugifyOrganizer('  !!Super Club!!  ')).toBe('super-club')
  })
})

describe('validateOrganizerSlugFormat', () => {
  it('refuse un slug trop court', () => {
    const result = validateOrganizerSlugFormat('ab')
    expect(result.ok).toBe(false)
  })

  it('refuse un slug réservé', () => {
    for (const reserved of RESERVED_ORGANIZER_SLUGS) {
      expect(validateOrganizerSlugFormat(reserved).ok).toBe(false)
    }
  })

  it('accepte un slug valide et le normalise', () => {
    const result = validateOrganizerSlugFormat('Mon Super Club')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.slug).toBe('mon-super-club')
  })
})
