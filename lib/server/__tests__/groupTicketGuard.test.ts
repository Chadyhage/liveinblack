// Port du test scripts/groupTicketGuard.test.mjs (legacy) — même règle
// métier, mêmes cas, portés vers l'API Mongoose (find().lean()) au lieu de
// l'API Firestore (collection().where().get()).
import { describe, it, expect } from 'vitest'
import { findGroupTieForEvent, groupTieBuyMessage } from '../groupTicketGuard'
import type { TicketModel } from '../../models/Ticket'

type FakeTicket = Record<string, unknown>

function fakeTicketModel(tickets: FakeTicket[]): TicketModel {
  return {
    find(filter: Record<string, unknown>) {
      const matched = tickets.filter((t) =>
        Object.entries(filter).every(([k, v]) => String(t[k] ?? '') === String(v))
      )
      return { lean: async () => matched }
    },
  } as unknown as TicketModel
}

const EVENT = 'evt1'
const TICKETS: FakeTicket[] = [
  // Charbel : hôte d'une Table 8 (3 sièges) — siège 2 attribué à Chady
  { ticketCode: 'T-1', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'charbel', seatIndex: 0, place: 'Table 8', paid: true },
  { ticketCode: 'T-2', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'chady', seatIndex: 1, place: 'Table 8', paid: true },
  { ticketCode: 'T-3', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'charbel', seatIndex: 2, place: 'Table 8', paid: true },
  // Riri : billet SOLO sur le même événement (pas de tableId) → ne compte pas
  { ticketCode: 'S-1', eventId: 'evt1', userId: 'riri', place: 'Entrée', paid: true },
  // Fifi : siège de table sur un AUTRE événement → ne compte pas pour evt1
  { ticketCode: 'T-9', eventId: 'evt2', tableId: 'tbl_Z', hostUid: 'loulou', userId: 'fifi', place: 'Carré VIP', paid: true },
  // Siège révoqué : ne compte pas
  { ticketCode: 'T-R', eventId: 'evt1', tableId: 'tbl_B', hostUid: 'bob', userId: 'momo', place: 'Table 4', paid: true, revoked: true },
]

describe('findGroupTieForEvent', () => {
  const Ticket = fakeTicketModel(TICKETS)

  it('détecte l\'acheteur/hôte (Charbel a acheté la Table 8)', async () => {
    const tie = await findGroupTieForEvent(Ticket, EVENT, 'charbel')
    expect(tie?.role).toBe('host')
    expect(tie?.tableId).toBe('tbl_A')
  })

  it('détecte le membre assigné (Chady a reçu un siège)', async () => {
    const tie = await findGroupTieForEvent(Ticket, EVENT, 'chady')
    expect(tie?.role).toBe('member')
    expect(tie?.tableId).toBe('tbl_A')
  })

  it('billet solo ≠ place de groupe (Riri libre)', async () => {
    expect(await findGroupTieForEvent(Ticket, EVENT, 'riri')).toBeNull()
  })

  it('autre événement non compté (Fifi libre sur evt1)', async () => {
    expect(await findGroupTieForEvent(Ticket, EVENT, 'fifi')).toBeNull()
  })

  it('même personne, autre event → lié là-bas', async () => {
    const tie = await findGroupTieForEvent(Ticket, 'evt2', 'fifi')
    expect(tie?.role).toBe('member')
  })

  it('siège révoqué non compté (Momo libre)', async () => {
    expect(await findGroupTieForEvent(Ticket, EVENT, 'momo')).toBeNull()
  })

  it('hôte de table révoquée : billet revoked ignoré (Bob libre)', async () => {
    expect(await findGroupTieForEvent(Ticket, EVENT, 'bob')).toBeNull()
  })

  it('utilisateur inconnu → null', async () => {
    expect(await findGroupTieForEvent(Ticket, EVENT, 'nobody')).toBeNull()
  })

  it('params manquants → null', async () => {
    expect(await findGroupTieForEvent(Ticket, '', 'charbel')).toBeNull()
    expect(await findGroupTieForEvent(null as unknown as TicketModel, EVENT, 'x')).toBeNull()
  })
})

describe('groupTieBuyMessage', () => {
  const Ticket = fakeTicketModel(TICKETS)

  it('message hôte', async () => {
    const tie = await findGroupTieForEvent(Ticket, EVENT, 'charbel')
    expect(groupTieBuyMessage(tie)).toContain('déjà réservé une place de groupe')
  })

  it('message membre + nom de la place', async () => {
    const tie = await findGroupTieForEvent(Ticket, EVENT, 'chady')
    expect(groupTieBuyMessage(tie)).toContain('fais déjà partie')
    expect(groupTieBuyMessage(tie)).toContain('Table 8')
  })
})
