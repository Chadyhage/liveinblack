import { describe, expect, it } from 'vitest'
import { filterSettingEntries, normalizeSettingsQuery, settingsInitials, splitPhone } from '../profileSettingsUtils'

describe('profileSettingsUtils', () => {
  it('normalise la recherche en supprimant les accents et espaces inutiles', () => {
    expect(normalizeSettingsQuery('  Confidentialité ')).toBe('confidentialite')
  })

  it('retourne les bonnes initiales', () => {
    expect(settingsInitials('Alice Bob')).toBe('AB')
    expect(settingsInitials('Nina')).toBe('NI')
    expect(settingsInitials('   ')).toBe('?')
  })

  it('filtre les réglages par mots-clés ou id', () => {
    const entries = [
      { id: 'identite', keywords: ['nom', 'prenom', 'telephone'] },
      { id: 'confidentialite', keywords: ['visibilite', 'prive'] },
      { id: 'mot de passe', keywords: ['password', 'securite'] },
    ]

    expect(filterSettingEntries(entries, ' télé ')).toEqual([entries[0]])
    expect(filterSettingEntries(entries, 'confident')).toEqual([entries[1]])
    expect(filterSettingEntries(entries, 'mot passe')).toEqual([entries[2]])
    expect(filterSettingEntries(entries, '')).toEqual(entries)
  })

  it('découpe correctement le téléphone stocké côté serveur', () => {
    expect(splitPhone('+228 90 11 22 33')).toEqual({ dialCode: '+228', number: '90 11 22 33' })
    expect(splitPhone('+33612345678')).toEqual({ dialCode: '+33', number: '612345678' })
    expect(splitPhone('009999')).toEqual({ dialCode: '+33', number: '009999' })
    expect(splitPhone('')).toEqual({ dialCode: '+33', number: '' })
  })
})
