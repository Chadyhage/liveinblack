// Port de src/utils/recommendations.js (moteur de score des recommandations
// personnalisées) — voir en-tête de ../recommendations.ts pour les
// différences assumées vis-à-vis du legacy (comportement = EventInterest,
// pas de journal localStorage).
import { describe, it, expect } from 'vitest'
import { getRecommendedEvents, scoreRecommendationEvent, type RecommendationEvent } from '../recommendations'

function makeEvent(overrides: Partial<RecommendationEvent> & { id: string }): RecommendationEvent {
  return {
    organizerId: 'org-1',
    city: 'Paris',
    eventType: '',
    musicStyles: [],
    ambiances: [],
    artists: [],
    places: [],
    ...overrides,
  }
}

describe('recommendations', () => {
  it('un événement dont le style musical correspond aux préférences score plus haut qu\'un événement sans correspondance', () => {
    const afrobeatEvent = makeEvent({ id: 'ev-afrobeat', musicStyles: ['afrobeat'] })
    const technoEvent = makeEvent({ id: 'ev-techno', musicStyles: ['techno'] })

    const matching = scoreRecommendationEvent({ musicStyles: ['afrobeat'] }, new Set(), afrobeatEvent)
    const nonMatching = scoreRecommendationEvent({ musicStyles: ['afrobeat'] }, new Set(), technoEvent)

    expect(matching.score).toBeGreaterThan(nonMatching.score)
    expect(matching.reason).toContain('Afrobeat')
    expect(nonMatching.score).toBe(0)
  })

  it('la ville matche au mot entier (Paris ≠ Parisot) et ajoute le bon poids', () => {
    const paris = scoreRecommendationEvent({ cities: ['Paris'] }, new Set(), makeEvent({ id: 'ev-1', city: 'Paris 11e' }))
    const parisot = scoreRecommendationEvent({ cities: ['Paris'] }, new Set(), makeEvent({ id: 'ev-2', city: 'Parisot' }))

    expect(paris.score).toBe(20)
    expect(parisot.score).toBe(0)
  })

  it('le budget ne matche que si le prix minimum de l\'event est CONNU et dans la fourchette déclarée', () => {
    const inBudget = scoreRecommendationEvent({ budget: '10-20' }, new Set(), makeEvent({ id: 'ev-1', places: [{ price: 15 }] }))
    const outOfBudget = scoreRecommendationEvent({ budget: '10-20' }, new Set(), makeEvent({ id: 'ev-2', places: [{ price: 45 }] }))
    const unknownPrice = scoreRecommendationEvent({ budget: 'gratuit' }, new Set(), makeEvent({ id: 'ev-3', places: [] }))

    expect(inBudget.score).toBe(15)
    expect(outOfBudget.score).toBe(0)
    // Prix inconnu ne doit jamais être confondu avec "gratuit"
    expect(unknownPrice.score).toBe(0)
  })

  it('un match de style déclaré et un signal d\'intérêt sur le même style ne se cumulent pas', () => {
    const event = makeEvent({ id: 'ev-1', musicStyles: ['house'] })
    const withDeclaredOnly = scoreRecommendationEvent({ musicStyles: ['house'] }, new Set(['house']), event)
    expect(withDeclaredOnly.score).toBe(25) // pas 25+5

    const interestOnly = scoreRecommendationEvent({}, new Set(['house']), event)
    expect(interestOnly.score).toBe(5)
  })

  it('getRecommendedEvents exige au moins une raison personnelle, exclut ses propres events, et trie par score décroissant', () => {
    const events: RecommendationEvent[] = [
      makeEvent({ id: 'ev-strong', musicStyles: ['afrobeat'], city: 'Lomé' }), // style + ville = 45
      makeEvent({ id: 'ev-weak', musicStyles: ['afrobeat'] }), // style seul = 25
      makeEvent({ id: 'ev-none', musicStyles: ['techno'] }), // aucun match = 0, exclu
      makeEvent({ id: 'ev-own', organizerId: 'me', musicStyles: ['afrobeat'], city: 'Lomé' }), // exclu (propre event)
    ]

    const results = getRecommendedEvents({
      preferences: { musicStyles: ['afrobeat'], cities: ['Lomé'] },
      events,
      currentUserId: 'me',
    })

    expect(results.map((r) => r.event.id)).toEqual(['ev-strong', 'ev-weak'])
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('sans aucune préférence ni signal d\'intérêt, aucune recommandation n\'est renvoyée', () => {
    const events: RecommendationEvent[] = [makeEvent({ id: 'ev-1', musicStyles: ['afrobeat'] })]
    expect(getRecommendedEvents({ preferences: null, events })).toEqual([])
  })
})
