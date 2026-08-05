// Port de scripts/boost-system.test.mjs (sous-ensemble lib/boosts.js — la partie
// musicPreferenceReason/recommendationCopy.js sera portée avec la phase reco).
import { describe, it, expect } from 'vitest'
import { activeBoostsForRegion, buildRegionalTopThree, getBoostPlan, normalizeBoostRegion } from '../boosts'

const NOW = Date.parse('2026-07-06T12:00:00Z')
const event = (id: string) => ({ id, name: id })
const boost = (eventId: string, position: number, region = 'France', extra: Record<string, unknown> = {}) => ({
  id: `${eventId}-${position}`,
  eventId,
  position,
  region,
  purchasedAt: '2026-07-06T10:00:00Z',
  expiresAt: '2026-07-07T12:00:00Z',
  ...extra,
})

describe('boosts', () => {
  it('sans boost, remplit les trois places avec le classement naturel', () => {
    const fallback = [event('a'), event('b'), event('c')]
    const result = buildRegionalTopThree({ events: fallback, fallbackEvents: fallback, now: NOW })
    expect(result.map((item) => [item.id, item.displayPosition, item.featured])).toEqual([
      ['a', 1, false],
      ['b', 2, false],
      ['c', 3, false],
    ])
  })

  it('les boosts Top 1, Top 2 et Top 3 restent exactement à leur place', () => {
    const events = [event('natural'), event('one'), event('two'), event('three')]
    const result = buildRegionalTopThree({
      events,
      fallbackEvents: [events[0]],
      boosts: [boost('three', 3), boost('one', 1), boost('two', 2)],
      region: 'france',
      now: NOW,
    })
    expect(result.map((item) => [item.id, item.displayPosition])).toEqual([
      ['one', 1],
      ['two', 2],
      ['three', 3],
    ])
  })

  it('un Top 2 ne devient jamais visuellement Top 1 si la première place est vide', () => {
    const two = event('two')
    const result = buildRegionalTopThree({ events: [two], fallbackEvents: [], boosts: [boost('two', 2)], region: 'France', now: NOW })
    expect(result.map((item) => [item.id, item.displayPosition])).toEqual([['two', 2]])
  })

  it("un même événement boosté sur deux positions n'apparaît qu'une fois (meilleure position)", () => {
    const events = [event('star'), event('filler')]
    const result = buildRegionalTopThree({
      events,
      fallbackEvents: [event('filler')],
      boosts: [boost('star', 1), boost('star', 2)],
      region: 'France',
      now: NOW,
    })
    expect(result.filter((item) => item.id === 'star').length).toBe(1)
    expect(result.map((item) => [item.id, item.displayPosition])).toEqual([
      ['star', 1],
      ['filler', 2],
    ])
  })

  it('régions, accents, codes pays et casse sont normalisés', () => {
    expect(normalizeBoostRegion('Bénin')).toBe('benin')
    expect(normalizeBoostRegion('FR')).toBe('france')
    expect(
      activeBoostsForRegion([boost('fr', 1, 'France'), boost('tg', 1, 'Togo')], 'FR', NOW).map((item) => item.eventId)
    ).toEqual(['fr'])
  })

  it('les boosts expirés ou en conflit ne sont jamais affichés', () => {
    const list = [
      boost('expired', 1, 'France', { expiresAt: '2026-07-06T11:59:59Z' }),
      boost('conflict', 2, 'France', { conflict: true }),
      boost('ok', 3),
    ]
    expect(activeBoostsForRegion(list, 'France', NOW).map((item) => item.eventId)).toEqual(['ok'])
  })

  it('le prix est déterminé par le catalogue serveur', () => {
    expect(getBoostPlan(2, 7)?.tier.price).toBe(34.99)
    expect(getBoostPlan(99, 1)).toBeNull()
    expect(getBoostPlan(1, 2)).toBeNull()
  })
})
