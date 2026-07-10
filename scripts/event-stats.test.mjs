import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessEventStats, computeEventStats, eventCapacity } from '../src/utils/eventStats.js'

const event = {
  date: '2026-08-10',
  places: [
    // Stock vivant : 2 Standard vendues (A payé + C guestlist) → available 98 ;
    // 1 VIP vendue (B) → available 19. Le remplissage est calculé sur CE stock,
    // pas sur le nombre de billets émis (une table = 1 unité vendable).
    { type: 'Standard', price: 20, total: 100, available: 98 },
    { type: 'VIP', price: 50, total: 20, available: 19 },
  ],
}

test('calcule capacité, revenus, gratuité et remplissage sans mélanger les notions', () => {
  const stats = computeEventStats(event, [
    { ticketCode: 'A', place: 'Standard', paid: true, bookedAt: '2026-07-01T10:00:00Z' },
    { ticketCode: 'B', place: 'VIP', paid: true, bookedAt: '2026-07-01T11:00:00Z', checkedInAt: '2026-08-10T20:00:00Z', preorderItems: { Mojito: 2 }, preorderSummary: [{ name: 'Mojito', emoji: '🍹', price: 8 }] },
    { ticketCode: 'C', place: 'Standard', paid: false, source: 'guestlist', bookedAt: '2026-07-02T10:00:00Z' },
  ], { now: new Date('2026-08-11T00:00:00Z') })

  assert.equal(eventCapacity(event), 120)
  assert.equal(stats.assignedTickets, 3)
  assert.equal(stats.paidTickets, 2)
  assert.equal(stats.freeTickets, 1)
  assert.equal(stats.estimatedRevenue, 70)
  assert.equal(stats.preorderRevenue, 16)
  assert.equal(stats.totalEstimatedRevenue, 86)
  assert.equal(stats.present, 1)
  // Stock : 3 unités vendues sur 120 → remplissage 2.5 % (calculé sur le stock
  // vivant, pas sur les billets émis). soldUnits/remaining verrouillés ici.
  assert.equal(stats.soldUnits, 3)
  assert.equal(stats.remaining, 117)
  assert.equal(stats.fillRate, 2.5)
})

test('place sans champ available (legacy) : traitée comme disponible, pas 100 % vendue', () => {
  // Régression : `Number(undefined) || 0 = 0` affichait une place non suivie
  // comme épuisée (0 restante → 100 % vendu). L'absence de `available` doit
  // valoir « stock plein », et `available: 0` explicite reste « épuisé ».
  const legacy = { date: '2026-08-10', places: [{ type: 'Standard', price: 20, total: 100 }] }
  const stats = computeEventStats(legacy, [])
  assert.equal(stats.capacity, 100)
  assert.equal(stats.remaining, 100)
  assert.equal(stats.soldUnits, 0)
  assert.equal(stats.fillRate, 0)

  const soldOut = { date: '2026-08-10', places: [{ type: 'Standard', price: 20, total: 100, available: 0 }] }
  const soldOutStats = computeEventStats(soldOut, [])
  assert.equal(soldOutStats.remaining, 0)
  assert.equal(soldOutStats.soldUnits, 100)
  assert.equal(soldOutStats.fillRate, 100)
})

test('ignore les billets révoqués', () => {
  const stats = computeEventStats(event, [
    { ticketCode: 'A', place: 'Standard', paid: true, revoked: true },
  ])
  assert.equal(stats.assignedTickets, 0)
  assert.equal(stats.estimatedRevenue, 0)
})

test('autorise un événement présent dans user_events malgré des métadonnées publiques anciennes', () => {
  assert.equal(canAccessEventStats({
    user: { uid: 'owner-1', role: 'organisateur' },
    event: { id: 'event-1', createdBy: 'legacy-owner' },
    userEvent: { id: 'event-1' },
    eventId: 'event-1',
  }), true)
})

test('refuse un événement appartenant uniquement à un autre organisateur', () => {
  assert.equal(canAccessEventStats({
    user: { uid: 'owner-1', role: 'organisateur' },
    event: { id: 'event-2', createdBy: 'owner-2' },
    eventId: 'event-2',
  }), false)
})
