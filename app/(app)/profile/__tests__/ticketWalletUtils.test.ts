import { describe, expect, it } from 'vitest'
import {
  bucketTicketGroups,
  classifyTicketGroup,
  countUpcomingSeats,
  hoursRemainingLabel,
  readDismissedTicketBanners,
  toMajor,
  visibleGroupTickets,
} from '../ticketWalletUtils'
import type { TicketWalletGroupView } from '../TicketWallet'

function makeGroup(overrides: Partial<TicketWalletGroupView>): TicketWalletGroupView {
  return {
    eventId: 'event-1',
    event: {
      id: 'event-1',
      name: 'Soiree',
      date: '2026-08-21T20:00:00.000Z',
      dateDisplay: '21 août 2026',
      time: '22:00',
      city: 'Paris',
      imageUrl: null,
      color: 'var(--qr-required-white)',
      cancelled: false,
      minAge: 18,
      hasPlaylist: true,
      postponed: false,
      refundWindowClosesAt: null,
    },
    myTickets: [],
    hostedSeats: [],
    ...overrides,
  }
}

describe('ticketWalletUtils', () => {
  it('convertit correctement les montants mineurs', () => {
    expect(toMajor(1250, 'EUR')).toBe(12.5)
    expect(toMajor(1250, 'XOF')).toBe(1250)
  })

  it('lit les bannières dismiss avec fallback propre', () => {
    expect([...readDismissedTicketBanners('["a","b"]')]).toEqual(['a', 'b'])
    expect([...readDismissedTicketBanners('not-json')]).toEqual([])
  })

  it('classe et bucketise les groupes de billets', () => {
    const now = new Date('2026-08-20T10:00:00.000Z')
    const upcoming = makeGroup({ eventId: 'upcoming', myTickets: [{ ticketCode: 't1' } as never] })
    const past = makeGroup({
      eventId: 'past',
      event: { ...makeGroup({}).event!, id: 'past', date: '2026-08-19T20:00:00.000Z', cancelled: false },
    })
    const cancelled = makeGroup({
      eventId: 'cancelled',
      event: { ...makeGroup({}).event!, id: 'cancelled', cancelled: true },
    })

    expect(classifyTicketGroup(upcoming, now)).toBe('upcoming')
    expect(classifyTicketGroup(past, now)).toBe('past')
    expect(classifyTicketGroup(cancelled, now)).toBe('cancelled')

    const buckets = bucketTicketGroups([past, cancelled, upcoming], now)
    expect(buckets.upcoming.map((g) => g.eventId)).toEqual(['upcoming'])
    expect(buckets.past.map((g) => g.eventId)).toEqual(['past'])
    expect(buckets.cancelled.map((g) => g.eventId)).toEqual(['cancelled'])
    expect(countUpcomingSeats(buckets.upcoming)).toBe(1)
  })

  it('masque les billets de table attribués à quelqu’un d’autre', () => {
    const group = makeGroup({
      myTickets: [
        { ticketCode: 'host-1', isHostSeat: true, assignedTo: 'other', assignedName: 'Other' } as never,
        { ticketCode: 'host-2', isHostSeat: true, assignedTo: 'me', assignedName: 'Me' } as never,
        { ticketCode: 'solo-1', isHostSeat: false, assignedTo: null } as never,
      ],
    })

    expect(visibleGroupTickets(group, 'me').map((t) => t.ticketCode)).toEqual(['host-2', 'solo-1'])
  })

  it('formate le compte à rebours des places bloquées', () => {
    const now = new Date('2026-08-20T10:00:00.000Z')
    expect(hoursRemainingLabel('2026-08-20T12:05:00.000Z', now)).toBe('2h05 restantes')
    expect(hoursRemainingLabel('2026-08-20T10:20:00.000Z', now)).toBe('20 min restantes')
    expect(hoursRemainingLabel('2026-08-20T09:59:00.000Z', now)).toBe('Expiré')
  })
})
