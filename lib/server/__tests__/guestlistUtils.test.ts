import { describe, expect, it, vi } from 'vitest'
import { normalizeGuestlistTicketCode, restockedAvailable, toGuestlistView } from '../events/guestlistUtils'

vi.mock('../events/ticketToken', () => ({
  signTicketToken: vi.fn(() => 'signed-token'),
}))

describe('guestlistUtils', () => {
  it('normalise le code billet invité', () => {
    expect(normalizeGuestlistTicketCode(' ab12 ')).toBe('AB12')
  })

  it('recrédite le stock sans dépasser le total', () => {
    expect(restockedAvailable(10, 7)).toBe(8)
    expect(restockedAvailable(10, 10)).toBe(10)
    expect(restockedAvailable(10, null)).toBe(1)
    expect(restockedAvailable(undefined, 4)).toBe(0)
    expect(restockedAvailable(0, 0)).toBe(0)
  })

  it('construit une vue guestlist avec URL billet signée', () => {
    const view = toGuestlistView({
      ticketCode: 'AB12',
      place: 'VIP',
      guestName: 'Jane Doe',
      bookedAt: '2026-08-20T10:00:00.000Z',
      checkedInAt: null,
      seatVersion: 2,
      entryNonce: 'nonce',
    })

    expect(view).toEqual({
      ticketCode: 'AB12',
      place: 'VIP',
      guestName: 'Jane Doe',
      bookedAt: '2026-08-20T10:00:00.000Z',
      checkedInAt: null,
      ticketUrl: 'https://liveinblack.com/ticket/signed-token',
    })
  })

  it('applique les fallbacks de vue quand certains champs billet sont absents', () => {
    const view = toGuestlistView({
      ticketCode: 'CD34',
      place: null,
      guestName: null,
      bookedAt: null,
      checkedInAt: undefined,
      seatVersion: null,
      entryNonce: undefined,
    })

    expect(view).toEqual({
      ticketCode: 'CD34',
      place: '',
      guestName: null,
      bookedAt: null,
      checkedInAt: null,
      ticketUrl: 'https://liveinblack.com/ticket/signed-token',
    })
  })
})
