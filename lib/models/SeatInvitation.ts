import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Modèle de consentement pour l'attribution de sièges de table (#37) :
// remplace le bind direct hôte → invité par un cycle invite/accept/decline.
// Un SeatInvitation ne modifie JAMAIS Ticket.userId/assignedTo tant qu'il
// n'est pas 'accepted' — voir lib/server/seatAssignment.ts pour le cycle
// complet. Le check "1 place de groupe par compte et par événement"
// (GroupMembership, index unique {eventId,userId}) n'est volontairement PAS
// évalué à la création de l'invitation : il ne l'est qu'au moment de
// l'acceptation, appelée par LA CIBLE elle-même — jamais synchrone dans la
// réponse HTTP de l'hôte, pour ne pas lui divulguer la présence de la cible
// à une autre table du même événement (fuite corrigée par ce fichier).
const STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const

const seatInvitationSchema = new Schema(
  {
    // Pas de `index: true` ici : l'index partiel unique déclaré plus bas sur
    // ce même champ (ticketCode) sert aussi pour les lookups — un second
    // index simple ferait doublon.
    ticketCode: { type: String, required: true },
    eventId: { type: String, required: true, index: true },
    tableId: { type: String, required: true },
    hostUid: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    targetEmail: { type: String, required: true },
    status: { type: String, enum: STATUSES, required: true, default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Un seul jeton d'invitation EN ATTENTE par siège à la fois — l'hôte doit
// annuler (cancel) une invitation en attente avant d'en émettre une autre
// pour le même ticketCode. Index PARTIEL : ne contraint que status:'pending',
// donc l'historique (accepted/declined/cancelled) ne bloque jamais une
// nouvelle invitation ultérieure sur le même siège.
seatInvitationSchema.index({ ticketCode: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })

export type SeatInvitationDoc = InferSchemaType<typeof seatInvitationSchema>
export type SeatInvitationModel = Model<SeatInvitationDoc>

export default (models.SeatInvitation as SeatInvitationModel) || model<SeatInvitationDoc>('SeatInvitation', seatInvitationSchema)
