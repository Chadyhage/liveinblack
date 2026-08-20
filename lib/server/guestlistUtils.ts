import { signTicketToken } from './ticketToken'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export interface GuestlistTicketLike {
  ticketCode: string
  place?: string | null
  guestName?: string | null
  bookedAt?: Date | string | null
  checkedInAt?: Date | string | null
  seatVersion?: number | null
  entryNonce?: string | null
}

export interface GuestlistEntryView {
  ticketCode: string
  place: string
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  ticketUrl: string
}

export function normalizeGuestlistTicketCode(ticketCode: string): string {
  return ticketCode.trim().toUpperCase()
}

export function restockedAvailable(total: number | null | undefined, available: number | null | undefined): number {
  return Math.min(total || 0, (available || 0) + 1)
}

export function toGuestlistView(ticket: GuestlistTicketLike): GuestlistEntryView {
  const token = signTicketToken({
    ticketCode: ticket.ticketCode,
    seatVersion: ticket.seatVersion ?? 0,
    entryNonce: ticket.entryNonce ?? null,
  })
  return {
    ticketCode: ticket.ticketCode,
    place: ticket.place ?? '',
    guestName: ticket.guestName ?? null,
    bookedAt: ticket.bookedAt ? new Date(ticket.bookedAt).toISOString() : null,
    checkedInAt: ticket.checkedInAt ? new Date(ticket.checkedInAt).toISOString() : null,
    ticketUrl: `${SITE}/ticket/${token}`,
  }
}
