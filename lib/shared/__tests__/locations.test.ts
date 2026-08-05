// Port de scripts/locations.test.mjs
import { describe, it, expect } from 'vitest'
import {
  getEntityRegionIds,
  inferRegionIdFromCity,
  matchesEntityRegion,
  normalizeGeoText,
  normalizeRegionId,
  normalizeRegionIds,
} from '../locations'

describe('locations', () => {
  it('normalise les régions actuelles et les anciennes saisies lisibles', () => {
    expect(normalizeRegionId('France')).toBe('france')
    expect(normalizeRegionId('FR')).toBe('france')
    expect(normalizeRegionId('intervention au Togo')).toBe('togo')
    expect(normalizeRegionId('Bénin')).toBe('benin')
    expect(normalizeGeoText('Lomé')).toBe('lome')
    expect(inferRegionIdFromCity('Lomé')).toBe('togo')
  })

  it('International remplace les zones individuelles', () => {
    expect(normalizeRegionIds(['france', 'international', 'togo'])).toEqual(['international'])
  })

  it('filtre un prestataire avec ses zones structurées', () => {
    const provider = { regionId: 'france', zonesIntervention: ['togo', 'benin'] }
    expect(getEntityRegionIds(provider)).toEqual(['france', 'togo', 'benin'])
    expect(matchesEntityRegion(provider, 'togo')).toBe(true)
    expect(matchesEntityRegion(provider, 'france')).toBe(true)
  })

  it('utilise aussi la région des événements pour un organisateur historique', () => {
    const organizer = { city: 'Lomé' }
    expect(matchesEntityRegion(organizer, 'togo', [{ region: 'Togo' }])).toBe(true)
    expect(matchesEntityRegion(organizer, 'france', [{ region: 'Togo' }])).toBe(false)
  })
})
