import { describe, expect, it } from 'vitest'
import { normalizeEventPlaces } from '../eventModalHelpers'

describe('eventModalHelpers', () => {
  it('normalise les places quand la réponse est valide', () => {
    expect(normalizeEventPlaces({
      ok: true,
      event: {
        places: [
          { id: 'vip', type: 'VIP', price: 25000 },
          { id: 'std', type: 'Standard', price: 10000 },
        ],
      },
    })).toEqual([
      { id: 'vip', type: 'VIP', price: 25000 },
      { id: 'std', type: 'Standard', price: 10000 },
    ])
  })

  it('retourne un tableau vide si la réponse est invalide', () => {
    expect(normalizeEventPlaces(null)).toEqual([])
    expect(normalizeEventPlaces({ ok: false })).toEqual([])
    expect(normalizeEventPlaces({ ok: true, event: {} })).toEqual([])
  })
})
