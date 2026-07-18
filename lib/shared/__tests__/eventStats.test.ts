// Tests UNITAIRES purs (aucune base) pour lib/shared/eventStats.ts (#7 phase
// organisateur — port de src/utils/eventStats.js).
import { describe, it, expect } from 'vitest'
import {
  computeEventStats,
  computeDemographics,
  buildEventInsights,
  buildAgeBuckets,
  ageFromBirthYear,
  eventStock,
  ticketPrice,
  eventStatsCsvRows,
  type StatsEvent,
  type StatsTicket,
} from '../eventStats'

const EVENT: StatsEvent = {
  places: [
    { type: 'Standard', total: 100, available: 60, price: 20 },
    { type: 'VIP', total: 10, available: 8, price: 50 },
  ],
  date: '2020-01-01', // dans le passé — sert aux tests "checkInReliable"
  minAge: 18,
}

function ticket(overrides: Partial<StatsTicket> = {}): StatsTicket {
  return {
    ticketCode: `TCK${Math.random().toString(36).slice(2, 8)}`,
    place: 'Standard',
    placePrice: 20,
    paid: true,
    checkedInAt: null,
    bookedAt: new Date().toISOString(),
    userId: 'user-1',
    revoked: false,
    preorders: [],
    ...overrides,
  }
}

describe('eventStock', () => {
  it('calcule capacité/restantes/vendues, une table de groupe = 1 unité', () => {
    const stock = eventStock(EVENT)
    expect(stock.capacity).toBe(110)
    expect(stock.remaining).toBe(68)
    expect(stock.sold).toBe(42)
  })

  it('filtre par catégorie', () => {
    const stock = eventStock(EVENT, 'VIP')
    expect(stock.capacity).toBe(10)
    expect(stock.remaining).toBe(8)
  })
})

describe('ticketPrice', () => {
  it('priorise placePrice sur le prix courant de la place', () => {
    expect(ticketPrice(EVENT, ticket({ placePrice: 15 }))).toBe(15)
  })
  it('retombe sur le prix courant si placePrice absent', () => {
    expect(ticketPrice(EVENT, ticket({ placePrice: null, place: 'VIP' }))).toBe(50)
  })
})

describe('computeEventStats', () => {
  it('calcule billets émis, revenus, taux de remplissage et de présence', () => {
    const tickets = [
      ticket({ paid: true, placePrice: 20 }),
      ticket({ paid: true, placePrice: 20, checkedInAt: new Date().toISOString() }),
      ticket({ paid: false, placePrice: 0, place: 'VIP' }), // guestlist
    ]
    const stats = computeEventStats(EVENT, tickets)
    expect(stats.assignedTickets).toBe(3)
    expect(stats.paidTickets).toBe(2)
    expect(stats.freeTickets).toBe(1)
    expect(stats.estimatedRevenue).toBe(40)
    expect(stats.present).toBe(1)
    expect(stats.attendanceRate).toBeCloseTo(33.33, 1)
    expect(stats.fillRate).toBeCloseTo((42 / 110) * 100, 5)
  })

  it('ignore les billets révoqués', () => {
    const tickets = [ticket({ revoked: true }), ticket()]
    const stats = computeEventStats(EVENT, tickets)
    expect(stats.assignedTickets).toBe(1)
  })

  it('filtre par catégorie', () => {
    const tickets = [ticket({ place: 'Standard' }), ticket({ place: 'VIP', placePrice: 50 })]
    const stats = computeEventStats(EVENT, tickets, { filters: { place: 'VIP' } })
    expect(stats.assignedTickets).toBe(1)
    expect(stats.capacity).toBe(10)
  })

  it('filtre par période (7 derniers jours)', () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    const tickets = [ticket({ bookedAt: old }), ticket()]
    const stats = computeEventStats(EVENT, tickets, { filters: { range: '7d' } })
    expect(stats.assignedTickets).toBe(1)
  })

  it('agrège les précommandes par nom, triées par revenu décroissant', () => {
    const tickets = [
      ticket({ preorders: [{ name: 'Bière', price: 5, qty: 2 }] }),
      ticket({ preorders: [{ name: 'Champagne', price: 80, qty: 1 }] }),
    ]
    const stats = computeEventStats(EVENT, tickets)
    expect(stats.preorderItems[0].name).toBe('Champagne')
    expect(stats.preorderRevenue).toBe(90)
  })

  it('checkInReliable est vrai si l’événement est passé, même sans scan', () => {
    const stats = computeEventStats(EVENT, [ticket()])
    expect(stats.checkInReliable).toBe(true) // EVENT.date est en 2020
  })

  it('checkInReliable est faux pour un événement futur sans aucun scan', () => {
    const futureEvent = { ...EVENT, date: '2099-01-01' }
    const stats = computeEventStats(futureEvent, [ticket()])
    expect(stats.checkInReliable).toBe(false)
  })
})

describe('buildEventInsights', () => {
  it('signale une capacité non définie', () => {
    const stats = computeEventStats({ places: [], date: '2020-01-01' }, [])
    const insights = buildEventInsights(stats)
    expect(insights.some((i) => i.text.includes('n’est pas définie'))).toBe(true)
  })

  it('signale zéro billet émis', () => {
    const stats = computeEventStats(EVENT, [])
    const insights = buildEventInsights(stats)
    expect(insights.some((i) => i.text.includes('Aucun billet émis'))).toBe(true)
  })
})

describe('ageFromBirthYear / buildAgeBuckets', () => {
  it('calcule un âge valide', () => {
    expect(ageFromBirthYear(1995, new Date('2026-01-01'))).toBe(31)
  })
  it('rejette une année hors bornes', () => {
    expect(ageFromBirthYear(1800)).toBeNull()
    expect(ageFromBirthYear(3000)).toBeNull()
  })
  it('construit des tranches à partir de l’âge minimum de l’événement', () => {
    const buckets = buildAgeBuckets(18)
    expect(buckets[0].label).toBe('18–24 ans')
    expect(buckets[buckets.length - 1].label).toBe('45 ans et +')
  })
})

describe('computeDemographics', () => {
  it('répartit âge/genre, isole les billets sans compte', () => {
    const tickets = [ticket({ userId: 'u1' }), ticket({ userId: 'u2' }), ticket({ userId: null })]
    const usersById = { u1: { birthYear: 1995, gender: 'femme' }, u2: { birthYear: 1990, gender: 'homme' } }
    const demo = computeDemographics(tickets, usersById, 18, new Date('2026-01-01'))
    expect(demo.noAccount).toBe(1)
    expect(demo.ageKnown).toBe(2)
    expect(demo.gender.femme).toBe(1)
    expect(demo.gender.homme).toBe(1)
  })

  it('remonte un âge sous le minimum vers la première tranche', () => {
    const tickets = [ticket({ userId: 'u1' })]
    const demo = computeDemographics(tickets, { u1: { birthYear: 2015 } }, 18, new Date('2026-01-01')) // 11 ans déclarés
    expect(demo.buckets[0].count).toBe(1) // rattaché à la tranche minimale, jamais une tranche inexistante
  })
})

describe('eventStatsCsvRows', () => {
  it('produit une ligne par billet avec les bons statuts', () => {
    const tickets = [ticket({ paid: true, checkedInAt: new Date().toISOString() }), ticket({ paid: false })]
    const stats = computeEventStats(EVENT, tickets)
    const rows = eventStatsCsvRows(EVENT, stats)
    expect(rows).toHaveLength(2)
    expect(rows[0].statut).toBe('present')
    expect(rows[0].type).toBe('payant')
    expect(rows[1].type).toBe('gratuit')
  })
})
