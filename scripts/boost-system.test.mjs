import test from 'node:test'
import assert from 'node:assert/strict'
import { activeBoostsForRegion, buildRegionalTopThree, getBoostPlan, normalizeBoostRegion } from '../lib/boosts.js'
import { musicPreferenceReason } from '../src/utils/recommendationCopy.js'

const NOW = Date.parse('2026-07-06T12:00:00Z')
const event = id => ({ id, name: id })
const boost = (eventId, position, region = 'France', extra = {}) => ({
  id: `${eventId}-${position}`, eventId, position, region,
  purchasedAt: '2026-07-06T10:00:00Z', expiresAt: '2026-07-07T12:00:00Z', ...extra,
})

test('sans boost, remplit les trois places avec le classement naturel', () => {
  const fallback = [event('a'), event('b'), event('c')]
  const result = buildRegionalTopThree({ events: fallback, fallbackEvents: fallback, now: NOW })
  assert.deepEqual(result.map(item => [item.id, item.displayPosition, item.featured]), [['a', 1, false], ['b', 2, false], ['c', 3, false]])
})

test('les boosts Top 1, Top 2 et Top 3 restent exactement à leur place', () => {
  const events = [event('natural'), event('one'), event('two'), event('three')]
  const result = buildRegionalTopThree({ events, fallbackEvents: [events[0]], boosts: [boost('three', 3), boost('one', 1), boost('two', 2)], region: 'france', now: NOW })
  assert.deepEqual(result.map(item => [item.id, item.displayPosition]), [['one', 1], ['two', 2], ['three', 3]])
})

test('un Top 2 ne devient jamais visuellement Top 1 si la première place est vide', () => {
  const two = event('two')
  const result = buildRegionalTopThree({ events: [two], fallbackEvents: [], boosts: [boost('two', 2)], region: 'France', now: NOW })
  assert.deepEqual(result.map(item => [item.id, item.displayPosition]), [['two', 2]])
})

test('régions, accents, codes pays et casse sont normalisés', () => {
  assert.equal(normalizeBoostRegion('Bénin'), 'benin')
  assert.equal(normalizeBoostRegion('FR'), 'france')
  assert.deepEqual(activeBoostsForRegion([boost('fr', 1, 'France'), boost('tg', 1, 'Togo')], 'FR', NOW).map(item => item.eventId), ['fr'])
})

test('les boosts expirés ou en conflit ne sont jamais affichés', () => {
  const list = [boost('expired', 1, 'France', { expiresAt: '2026-07-06T11:59:59Z' }), boost('conflict', 2, 'France', { conflict: true }), boost('ok', 3)]
  assert.deepEqual(activeBoostsForRegion(list, 'France', NOW).map(item => item.eventId), ['ok'])
})

test('le prix est déterminé par le catalogue serveur', () => {
  assert.equal(getBoostPlan(2, 7).tier.price, 34.99)
  assert.equal(getBoostPlan(99, 1), null)
  assert.equal(getBoostPlan(1, 2), null)
})

test('la recommandation musicale reste grammaticale pour tous les styles', () => {
  for (const style of ['House', 'Afrobeat', 'R&B', 'musique électronique']) {
    assert.equal(musicPreferenceReason(style), `${style} correspond à tes goûts`)
  }
  assert.doesNotMatch(musicPreferenceReason('House'), /tu aimes/i)
})
