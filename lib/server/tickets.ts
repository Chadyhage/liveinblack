import { getDb } from '../db/mongoose'
import Ticket from '../models/Ticket'
import Event from '../models/Event'
import Order from '../models/Order'
import ResaleListing from '../models/ResaleListing'
import { verifyTicketToken, extractTicketCode, signTicketToken } from './ticketToken'

// Contrairement au legacy (payload d'affichage embarqué dans le jeton, pensé
// pour fonctionner hors-ligne avec Firestore), l'affichage vient ici
// TOUJOURS d'une lecture Mongo fraîche : un billet révoqué après émission du
// jeton ne s'affiche plus jamais comme valide.
export interface TicketDisplay {
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  placePrice: number
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number; showOptionId: string | null; showLabel: string | null; showInfo: string | null }[]
  guestName: string | null
  bookedAt: string | null
}

export async function getTicketDisplay(token: string): Promise<TicketDisplay | null> {
  const ticketCode = extractTicketCode(token)
  if (!ticketCode) return null

  await getDb()
  const ticket = await Ticket.findOne({ ticketCode }).lean()
  if (!ticket) return null

  const valid = verifyTicketToken(token, {
    ticketCode: ticket.ticketCode,
    seatVersion: ticket.seatVersion ?? 0,
    entryNonce: ticket.entryNonce ?? null,
  })
  if (!valid) return null
  // Un billet révoqué (siège réattribué à quelqu'un d'autre, remboursement,
  // événement annulé...) ne doit plus jamais s'afficher comme "valide" — la
  // fraîcheur du jeton ne suffit pas à elle seule, on vérifie aussi l'état.
  if (ticket.revoked) return null

  return {
    ticketCode: ticket.ticketCode,
    eventId: ticket.eventId,
    eventName: ticket.eventName,
    eventDate: ticket.eventDate,
    place: ticket.place,
    placePrice: ticket.placePrice,
    totalPrice: ticket.totalPrice,
    currency: ticket.currency,
    preorders: ticket.preorders.map((p) => ({ name: p.name, price: p.price ?? 0, qty: p.qty ?? 1, showOptionId: p.showOptionId ?? null, showLabel: p.showLabel ?? null, showInfo: p.showInfo ?? null })),
    guestName: ticket.guestName ?? null,
    bookedAt: ticket.bookedAt ? new Date(ticket.bookedAt).toISOString() : null,
  }
}

const MY_TICKETS_CAP = 500

// ──────────────────────────────── listMyTickets ─────────────────────────────
// Port du "portefeuille" de billets de ProfilePage.jsx (#6 phase profil).
// Contrairement à getTicketDisplay ci-dessus (un seul billet, par jeton
// public), cette fonction sert une vue authentifiée : TOUS les billets liés
// au compte appelant, groupés par événement, avec de quoi construire
// TableHostPanel (attribuer/reprendre un siège) — dont la mutation réelle
// passe déjà par lib/server/seatAssignment.ts (#37), jamais dupliquée ici.

export interface TicketWalletItemView {
  ticketCode: string
  // Jeton SIGNÉ (lib/server/ticketToken.ts) — c'est lui, et non ticketCode
  // brut, qui doit alimenter le lien/QR vers /ticket/[token] (getTicketDisplay
  // exige un jeton signé, cf. commentaire de toWalletItemView ci-dessous).
  ticketToken: string
  place: string
  placePrice: number
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number; showOptionId: string | null; showLabel: string | null; showInfo: string | null }[]
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  // Billet actuellement détenu par l'appelant (userId === caller.id) — c'est
  // CE sous-ensemble qui s'affiche comme "mes billets" (cartes QR). Un siège
  // de table hébergé mais attribué à quelqu'un d'autre a isMine:false.
  isMine: boolean
  // Siège d'une table dont l'appelant est l'hôte (hostUid === caller.id),
  // qu'il le détienne encore ou qu'il l'ait déjà attribué — c'est ce
  // sous-ensemble qui alimente TableHostPanel.
  isHostSeat: boolean
  tableId: string | null
  seatIndex: number | null
  assignedTo: string | null
  assignedName: string | null
  // Commande d'origine + si une demande de remboursement client a déjà été
  // faite dessus (lib/server/clientRefunds.ts) — null pour un billet sans
  // Order (guestlist, non remboursable de toute façon).
  orderId: string | null
  refundRequested: boolean
  // Assurance-annulation payée à l'achat (lib/shared/fees.ts::CANCELLATION_PROTECTION)
  // — donne droit au bouton de remboursement même si l'event n'est pas
  // reporté (voir requestClientRefund, qui bypasse la condition de report
  // dans ce cas précis).
  cancellationProtectionPurchased: boolean
  // Revente officielle (lib/server/resale.ts). `resellable` reflète les
  // conditions vérifiables ici (source/scan/déjà en vente) — la fenêtre de
  // clôture (2h avant les portes) et le statut de l'event sont revérifiés
  // serveur au moment de la mise en vente, jamais fiés à cet indicateur seul.
  resellable: boolean
  activeListing: { id: string; resalePriceMinor: number; feeMinor: number; sellerNetMinor: number; status: string } | null
}

export interface TicketWalletEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  time: string
  city: string
  imageUrl: string | null
  color: string
  cancelled: boolean
  minAge: number
  hasPlaylist: boolean
  // Report en cours (postponedFrom non-null) + fenêtre encore ouverte pour
  // demander un remboursement plutôt que de garder son billet pour la
  // nouvelle date (lib/server/clientRefunds.ts).
  postponed: boolean
  refundWindowClosesAt: string | null
}

export interface TicketWalletGroupView {
  eventId: string
  // null si l'événement a depuis été supprimé — le client affiche alors un
  // groupe générique plutôt que de planter (même garde que eventInterests).
  event: TicketWalletEventView | null
  myTickets: TicketWalletItemView[]
  hostedSeats: TicketWalletItemView[]
}

export type ListMyTicketsResult = { ok: true; groups: TicketWalletGroupView[] }

function toWalletItemView(
  ticket: {
    ticketCode: string
    seatVersion?: number | null
    entryNonce?: string | null
    place?: string | null
    placePrice?: number | null
    totalPrice?: number | null
    currency?: string | null
    preorders?: { name: string; price?: number | null; qty?: number | null; showOptionId?: string | null; showLabel?: string | null; showInfo?: string | null }[]
    guestName?: string | null
    bookedAt?: Date | string | null
    checkedInAt?: Date | string | null
    userId: string
    hostUid?: string | null
    tableId?: string | null
    seatIndex?: number | null
    assignedTo?: string | null
    assignedName?: string | null
    orderId?: string | null
    revoked?: boolean | null
    source?: string | null
    resaleListingId?: string | null
    resaleCount?: number | null
  },
  callerId: string,
  refundedOrderIds: Set<string>,
  protectedOrderIds: Set<string>,
  listingsById: Map<string, { resalePriceMinor: number; feeMinor: number; sellerNetMinor: number; status: string }>
): TicketWalletItemView {
  const RESALE_LIMIT = 2
  const listing = ticket.resaleListingId ? listingsById.get(ticket.resaleListingId) ?? null : null
  const resellable =
    !ticket.checkedInAt &&
    !ticket.revoked &&
    !ticket.resaleListingId &&
    (ticket.source === 'paid' || ticket.source === 'stripe-webhook' || ticket.source === 'fedapay-webhook') &&
    (ticket.resaleCount ?? 0) < RESALE_LIMIT
  return {
    ticketCode: ticket.ticketCode,
    ticketToken: signTicketToken({
      ticketCode: ticket.ticketCode,
      seatVersion: ticket.seatVersion ?? 0,
      entryNonce: ticket.entryNonce ?? null,
    }),
    place: ticket.place ?? '',
    placePrice: ticket.placePrice ?? 0,
    totalPrice: ticket.totalPrice ?? 0,
    currency: ticket.currency ?? 'EUR',
    preorders: (ticket.preorders ?? []).map((p) => ({ name: p.name, price: p.price ?? 0, qty: p.qty ?? 1, showOptionId: p.showOptionId ?? null, showLabel: p.showLabel ?? null, showInfo: p.showInfo ?? null })),
    guestName: ticket.guestName ?? null,
    bookedAt: ticket.bookedAt ? new Date(ticket.bookedAt).toISOString() : null,
    checkedInAt: ticket.checkedInAt ? new Date(ticket.checkedInAt).toISOString() : null,
    isMine: ticket.userId === callerId,
    isHostSeat: ticket.hostUid === callerId,
    tableId: ticket.tableId ?? null,
    seatIndex: ticket.seatIndex ?? null,
    assignedTo: ticket.assignedTo ?? null,
    assignedName: ticket.assignedName ?? null,
    orderId: ticket.orderId ?? null,
    refundRequested: ticket.orderId ? refundedOrderIds.has(ticket.orderId) : false,
    cancellationProtectionPurchased: ticket.orderId ? protectedOrderIds.has(ticket.orderId) : false,
    resellable,
    activeListing: listing ? { id: ticket.resaleListingId as string, ...listing } : null,
  }
}

export async function listMyTickets(callerId: string): Promise<ListMyTicketsResult> {
  await getDb()

  // $or (jamais deux requêtes séparées) : un même billet peut satisfaire les
  // deux côtés (le propre siège de l'hôte, avant toute attribution) — une
  // union naïve de deux requêtes le dupliquerait dans le résultat.
  // Plafond ajouté suite à l'audit du 12/08/2026 : cette requête n'avait
  // aucune limite — un compte actif depuis plusieurs années verrait cette
  // liste grossir indéfiniment. Bornée aux billets les plus récents, plafond
  // généreux (aucun utilisateur légitime n'a réellement plus de billets que
  // ça sur toute sa durée de vie).
  const tickets = await Ticket.find({
    $or: [{ userId: callerId }, { hostUid: callerId }],
    revoked: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(MY_TICKETS_CAP)
    .lean()

  if (tickets.length === 0) return { ok: true, groups: [] }

  const eventIds = [...new Set(tickets.map((t) => t.eventId))]
  const events = await Event.find({ _id: { $in: eventIds } }).lean()
  const eventById = new Map(events.map((e) => [String(e._id), e]))

  const orderIds = [...new Set(tickets.map((t) => t.orderId).filter((id): id is string => Boolean(id)))]
  const refundedOrders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds }, clientRefundRequestedAt: { $ne: null } }).select('_id').lean()
    : []
  const refundedOrderIds = new Set(refundedOrders.map((o) => String(o._id)))

  const protectedOrders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds }, cancellationProtectionPurchased: true }).select('_id').lean()
    : []
  const protectedOrderIds = new Set(protectedOrders.map((o) => String(o._id)))

  const listingIds = [...new Set(tickets.map((t) => t.resaleListingId).filter((id): id is string => Boolean(id)))]
  const listings = listingIds.length ? await ResaleListing.find({ _id: { $in: listingIds } }).lean() : []
  const listingsById = new Map(
    listings.map((l) => [String(l._id), { resalePriceMinor: l.resalePriceMinor, feeMinor: l.feeMinor, sellerNetMinor: l.sellerNetMinor, status: l.status }])
  )

  const ticketsByEvent = new Map<string, typeof tickets>()
  for (const ticket of tickets) {
    const list = ticketsByEvent.get(ticket.eventId) ?? []
    list.push(ticket)
    ticketsByEvent.set(ticket.eventId, list)
  }

  const groups: TicketWalletGroupView[] = [...ticketsByEvent.entries()].map(([eventId, eventTickets]) => {
    const ev = eventById.get(eventId)
    const views = eventTickets.map((t) => toWalletItemView(t, callerId, refundedOrderIds, protectedOrderIds, listingsById))
    return {
      eventId,
      event: ev
        ? {
            id: String(ev._id),
            name: ev.name,
            date: ev.date,
            dateDisplay: ev.dateDisplay ?? '',
            time: ev.time ?? '',
            city: ev.city ?? '',
            imageUrl: ev.imageUrl ?? null,
            color: ev.color ?? '#c8a96e',
            cancelled: Boolean(ev.cancelled),
            minAge: ev.minAge ?? 18,
            hasPlaylist: Boolean(ev.playlist),
            postponed: Boolean(ev.postponedFrom),
            refundWindowClosesAt: ev.refundWindowClosesAt ? new Date(ev.refundWindowClosesAt).toISOString() : null,
          }
        : null,
      myTickets: views.filter((v) => v.isMine),
      hostedSeats: views.filter((v) => v.isHostSeat),
    }
  })

  return { ok: true, groups }
}
