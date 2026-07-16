// Port de scripts/event-discovery.test.mjs (sous-ensemble eventDiscovery/locations)
import { describe, it, expect } from 'vitest'
import { isClientDiscoverableEvent, isPlaceholderEvent } from '../eventDiscovery'
import { matchesEntityRegion } from '../locations'

describe('eventDiscovery', () => {
  it('Île-de-France correspond au filtre national France', () => {
    expect(matchesEntityRegion({ region: 'Île-de-France', city: 'Paris' }, 'france')).toBe(true)
  })

  it('la vitrine client ne met pas en avant les fillers, démos ou soirées passées', () => {
    const now = new Date('2026-07-07T12:00:00').getTime()

    expect(isPlaceholderEvent({ name: 'Filler One' })).toBe(true)
    expect(
      isClientDiscoverableEvent({ id: 'real', name: 'AFRO NATION LOMÉ', date: '2026-09-19', time: '22:00', endTime: '05:00' }, now)
    ).toBe(true)
    expect(
      isClientDiscoverableEvent({ id: 'past', name: 'TEST COMPLET — LIVE IN BLACK 2026', date: '2026-07-05', time: '21:00', endTime: '06:00' }, now)
    ).toBe(false)
    expect(
      isClientDiscoverableEvent({ id: 'filler', name: 'Filler Two', date: '2026-07-10', time: '21:00', endTime: '05:00' }, now)
    ).toBe(false)
    expect(
      isClientDiscoverableEvent({ id: 'demo', name: 'Démo statistiques', date: '2026-07-10', time: '21:00', isDemo: true }, now)
    ).toBe(false)
  })
})
