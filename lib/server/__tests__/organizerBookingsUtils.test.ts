import { describe, expect, it } from 'vitest'
import { listValidBuyerIds, toBookingView } from '../organizer/organizerBookingsUtils'

describe('organizerBookingsUtils', () => {
  it('garde uniquement les userId valides et uniques', () => {
    const validId = '68a55b4f75fb6f3ec5d0a001'

    expect(
      listValidBuyerIds([
        { ticketCode: 'A', userId: validId },
        { ticketCode: 'B', userId: validId },
        { ticketCode: 'C', userId: 'not-an-object-id' },
        { ticketCode: 'D', userId: null },
      ])
    ).toEqual([validId])
  })

  it('construit la vue réservations avec fallbacks et agrégations', () => {
    const buyerId = '68a55b4f75fb6f3ec5d0a002'
    const view = toBookingView(
      [
        {
          ticketCode: 'T1',
          place: 'VIP',
          placePrice: 15000,
          totalPrice: 18000,
          userId: buyerId,
          preorders: [
            { name: 'Bouteille', price: 3000, qty: 2, showLabel: 'Sparkles', showInfo: 'Table 8' },
            { name: 'Soft', qty: undefined },
          ],
        },
        {
          ticketCode: 'T2',
          place: '',
          placePrice: null,
          totalPrice: null,
          guestName: 'Invité VIP',
          preorders: [{ name: 'Bouteille', price: 3000, qty: 1 }],
        },
      ],
      new Map([[buyerId, 'Ada Lovelace']])
    )

    expect(view).toEqual({
      tickets: [
        {
          ticketCode: 'T1',
          place: 'VIP',
          placePrice: 15000,
          totalPrice: 18000,
          buyerName: 'Ada Lovelace',
          preorders: [
            { name: 'Bouteille', price: 3000, qty: 2, showLabel: 'Sparkles', showInfo: 'Table 8' },
            { name: 'Soft', price: 0, qty: 1, showLabel: null, showInfo: null },
          ],
        },
        {
          ticketCode: 'T2',
          place: 'Standard',
          placePrice: 0,
          totalPrice: 0,
          buyerName: 'Invité VIP',
          preorders: [{ name: 'Bouteille', price: 3000, qty: 1, showLabel: null, showInfo: null }],
        },
      ],
      ticketCount: 2,
      summaryByPlace: [
        { place: 'VIP', count: 1 },
        { place: 'Standard', count: 1 },
      ],
      preorderSummary: [
        { name: 'Bouteille', qty: 3 },
        { name: 'Soft', qty: 1 },
      ],
    })
  })

  it('privilégie guestName sur buyerName quand les deux existent', () => {
    const buyerId = '68a55b4f75fb6f3ec5d0a003'
    const view = toBookingView(
      [
        {
          ticketCode: 'T3',
          place: 'VIP',
          userId: buyerId,
          guestName: 'Nom invité affiché',
        },
      ],
      new Map([[buyerId, 'Acheteur Compte']])
    )

    expect(view.tickets[0].buyerName).toBe('Nom invité affiché')
  })

  it('conserve qty=0 quand une précommande explicite le fournit', () => {
    const view = toBookingView(
      [
        {
          ticketCode: 'T4',
          preorders: [{ name: 'Soft', qty: 0, price: 2000 }],
        },
      ],
      new Map()
    )

    expect(view.preorderSummary).toEqual([{ name: 'Soft', qty: 0 }])
    expect(view.tickets[0].preorders).toEqual([{ name: 'Soft', qty: 0, price: 2000, showLabel: null, showInfo: null }])
  })

  it('retourne une vue vide sans agrégats parasites quand aucun billet n’est fourni', () => {
    expect(toBookingView([], new Map())).toEqual({
      tickets: [],
      ticketCount: 0,
      summaryByPlace: [],
      preorderSummary: [],
    })
  })
})
