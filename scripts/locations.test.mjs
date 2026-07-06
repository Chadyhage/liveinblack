import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getEntityRegionIds,
  matchesEntityRegion,
  normalizeGeoText,
  normalizeRegionId,
  normalizeRegionIds,
} from '../src/utils/locations.js'

test('normalise les régions actuelles et les anciennes saisies lisibles', () => {
  assert.equal(normalizeRegionId('France'), 'france')
  assert.equal(normalizeRegionId('FR'), 'france')
  assert.equal(normalizeRegionId('intervention au Togo'), 'togo')
  assert.equal(normalizeRegionId('Bénin'), 'benin')
  assert.equal(normalizeGeoText('Lomé'), 'lome')
})

test('International remplace les zones individuelles', () => {
  assert.deepEqual(normalizeRegionIds(['france', 'international', 'togo']), ['international'])
})

test('filtre un prestataire avec ses zones structurées', () => {
  const provider = { regionId: 'france', zonesIntervention: ['togo', 'benin'] }
  assert.deepEqual(getEntityRegionIds(provider), ['france', 'togo', 'benin'])
  assert.equal(matchesEntityRegion(provider, 'togo'), true)
  assert.equal(matchesEntityRegion(provider, 'france'), true)
})

test('utilise aussi la région des événements pour un organisateur historique', () => {
  const organizer = { city: 'Lomé' }
  assert.equal(matchesEntityRegion(organizer, 'togo', [{ region: 'Togo' }]), true)
  assert.equal(matchesEntityRegion(organizer, 'france', [{ region: 'Togo' }]), false)
})

