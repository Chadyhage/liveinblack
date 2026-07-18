// Port TypeScript de lib/groupTicketGuard.js (legacy Firestore) vers Mongoose.
// RÈGLE MÉTIER inchangée : pour un même événement, un utilisateur ne peut être
// lié qu'à UNE SEULE place de groupe (table/pack), en tant qu'hôte (acheteur)
// OU en tant que membre (siège attribué) — voir lib/models/Ticket.ts pour la
// forme des documents (un `tableId` partagé = une place de groupe).
import type { TicketModel } from '../models/Ticket'

export type GroupTie = {
  role: 'host' | 'member'
  tableId: string
  place: string
  ticketCode: string
}

export async function findGroupTieForEvent(
  TicketCollection: TicketModel,
  eventId: string,
  uid: string
): Promise<GroupTie | null> {
  if (!TicketCollection || !eventId || !uid) return null

  const [asHost, asHolder] = await Promise.all([
    TicketCollection.find({ eventId: String(eventId), hostUid: String(uid) }).lean(),
    TicketCollection.find({ eventId: String(eventId), userId: String(uid) }).lean(),
  ])

  const firstGroupTicket = (docs: Array<Record<string, unknown>>): GroupTie | null => {
    const found = docs.find((t) => t && t.tableId && t.revoked !== true)
    if (!found) return null
    return {
      role: 'host', // overwritten by caller for the "asHolder" branch
      tableId: String(found.tableId),
      place: String(found.place || ''),
      ticketCode: String(found.ticketCode || ''),
    }
  }

  const hostTie = firstGroupTicket(asHost as Array<Record<string, unknown>>)
  if (hostTie) return { ...hostTie, role: 'host' }

  const memberTie = firstGroupTicket(asHolder as Array<Record<string, unknown>>)
  if (memberTie) return { ...memberTie, role: 'member' }

  return null
}

export function groupTieBuyMessage(tie: GroupTie | null): string {
  const placeLabel = tie?.place ? ` (${tie.place})` : ''
  return tie?.role === 'host'
    ? `Tu as déjà réservé une place de groupe pour cet événement${placeLabel}. Une seule place de groupe par compte et par événement.`
    : `Tu fais déjà partie d'une place de groupe pour cet événement${placeLabel} — une place t'y a été attribuée. Une seule place de groupe par compte et par événement.`
}
