import { describe, expect, it, vi } from 'vitest'
import {
  assignStablePlaceIds,
  normalizeMenuItems,
  placeConsumed,
  shouldSendEventRecap,
  toEventDates,
  validatePlaces,
} from '../organizer/organizerEventUtils'

describe('organizerEventUtils', () => {
  it('génère un id stable pour une place sans id et initialise available', () => {
    vi.spyOn(Math, 'random')
    const [place] = assignStablePlaceIds([{ id: '', type: 'Standard', price: 20, total: 100 }])
    expect(place.id).toMatch(/^p/)
    expect(place.available).toBe(100)
  })

  it('calcule la consommation réelle depuis total et available', () => {
    expect(placeConsumed({ total: 100, available: 96 })).toBe(4)
    expect(placeConsumed({ total: 5, available: 8 })).toBe(0)
  })

  it('valide les places et renvoie le bon code d’erreur', () => {
    expect(validatePlaces([{ id: '', type: '', price: 20, total: 100 }])).toBe('place_type_required')
    expect(validatePlaces([{ id: '', type: 'VIP', price: -1, total: 10 }])).toBe('invalid_place_price')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 10, total: 1.5 }])).toBe('invalid_place_qty')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 10, total: 10, maxPerAccount: -1 }])).toBe('invalid_place_max_per_account')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 0, total: 10, groupType: 'group', groupMin: 2, groupMax: 4 }])).toBe('group_place_requires_price')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 10, total: 10, groupType: 'group', groupMin: -1, groupMax: 4 }])).toBe('invalid_group_min')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 10, total: 10, groupType: 'group', groupMin: 2, groupMax: -1 }])).toBe('invalid_group_max')
    expect(validatePlaces([{ id: '', type: 'VIP', price: 10, total: 10, groupType: 'group', groupMin: 5, groupMax: 4 }])).toBe('group_max_below_min')
    expect(validatePlaces([{ id: '', type: 'OK', price: 10, total: 10 }])).toBeNull()
  })

  it('normalise le menu et active les items par défaut', () => {
    const [item] = normalizeMenuItems([{ name: 'Cocktail', hasShow: false }])
    expect(item.available).toBe(true)
    expect(item.showOptions).toEqual([])

    const [withShow] = normalizeMenuItems([
      {
        name: 'Pack VIP',
        hasShow: true,
        available: false,
        showOptions: ['Pancarte'],
      },
    ])
    expect(withShow.available).toBe(false)
    expect(withShow.showOptions).toEqual([
      {
        id: 'show-1-pancarte',
        label: 'Pancarte',
        requiresInfo: false,
        infoPrompt: '',
        excludedPlaces: [],
      },
    ])
  })

  it('formate la date événement en libellé FR majuscule', () => {
    expect(toEventDates('2026-12-31')).toContain('2026')
  })

  it('détermine si un rappel organisateur doit partir dans la bonne fenêtre', () => {
    const now = new Date('2026-08-20T12:00:00.000Z').getTime()
    expect(shouldSendEventRecap(new Date('2026-08-21T12:00:00.000Z').getTime(), now)).toBe(true)
    expect(shouldSendEventRecap(new Date('2026-08-22T12:00:00.000Z').getTime(), now)).toBe(true)
    expect(shouldSendEventRecap(new Date('2026-08-21T11:59:59.999Z').getTime(), now)).toBe(false)
    expect(shouldSendEventRecap(new Date('2026-08-20T20:00:00.000Z').getTime(), now)).toBe(false)
    expect(shouldSendEventRecap(new Date('2026-08-23T12:00:00.000Z').getTime(), now)).toBe(false)
  })
})
