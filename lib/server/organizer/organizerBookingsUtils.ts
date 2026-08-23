import mongoose from 'mongoose'

export interface BookingTicketPreorderView {
  name: string
  price: number
  qty: number
  showLabel: string | null
  showInfo: string | null
}

export interface BookingTicketView {
  ticketCode: string
  place: string
  placePrice: number
  totalPrice: number
  buyerName: string | null
  preorders: BookingTicketPreorderView[]
}

export interface EventBookingsView {
  tickets: BookingTicketView[]
  ticketCount: number
  summaryByPlace: { place: string; count: number }[]
  preorderSummary: { name: string; qty: number }[]
}

export interface BookingTicketSource {
  ticketCode: string
  place?: string | null
  placePrice?: number | null
  totalPrice?: number | null
  guestName?: string | null
  userId?: string | null
  preorders?: Array<{
    name: string
    price?: number | null
    qty?: number | null
    showLabel?: string | null
    showInfo?: string | null
  }> | null
}

export function listValidBuyerIds(tickets: BookingTicketSource[]): string[] {
  return [...new Set(tickets.map((ticket) => ticket.userId).filter(Boolean))].filter((id): id is string => mongoose.isValidObjectId(id))
}

export function toBookingView(tickets: BookingTicketSource[], buyerNameById: Map<string, string>): EventBookingsView {
  const summaryByPlaceMap = new Map<string, number>()
  const preorderSummaryMap = new Map<string, number>()

  const ticketViews: BookingTicketView[] = tickets.map((ticket) => {
    const place = ticket.place || 'Standard'
    summaryByPlaceMap.set(place, (summaryByPlaceMap.get(place) ?? 0) + 1)

    const preorders = (ticket.preorders || []).map((preorder) => {
      const qty = preorder.qty ?? 1
      preorderSummaryMap.set(preorder.name, (preorderSummaryMap.get(preorder.name) ?? 0) + qty)
      return {
        name: preorder.name,
        price: preorder.price ?? 0,
        qty,
        showLabel: preorder.showLabel ?? null,
        showInfo: preorder.showInfo ?? null,
      }
    })

    return {
      ticketCode: ticket.ticketCode,
      place,
      placePrice: ticket.placePrice ?? 0,
      totalPrice: ticket.totalPrice ?? 0,
      buyerName: ticket.guestName || (ticket.userId ? buyerNameById.get(ticket.userId) : null) || null,
      preorders,
    }
  })

  return {
    tickets: ticketViews,
    ticketCount: ticketViews.length,
    summaryByPlace: [...summaryByPlaceMap.entries()].map(([place, count]) => ({ place, count })),
    preorderSummary: [...preorderSummaryMap.entries()].map(([name, qty]) => ({ name, qty })),
  }
}
