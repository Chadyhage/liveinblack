// Type partagé par tous les composants du tableau de bord organisateur (#7
// phase organisateur, port de MesEvenementsPage.jsx) — miroir de
// `OrganizerEventView` (lib/server/organizerEvents.ts).
export interface OrganizerEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  time: string
  cancelled: boolean
  postponed: boolean
  isPrivate: boolean
  imageUrl: string | null
  videoUrl: string | null
  city: string
  region: string
  currency: 'EUR' | 'XOF'
  soldCount: number
  ticketCount: number
  revenue: number
}

export type EventActionKey = 'stats' | 'bookings' | 'boost' | 'guests' | 'staff' | 'promo' | 'codes' | 'duplicate' | 'edit' | 'postpone' | 'delete'

export function formatMoney(amount: number, currency: 'EUR' | 'XOF'): string {
  if (currency === 'XOF') return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`
  return `${amount.toFixed(2).replace('.', ',')} €`
}
