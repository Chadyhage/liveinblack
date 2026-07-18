import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `friend_requests/{id}` (Firestore). Contrairement au legacy, qui
// se contente de SUPPRIMER la demande à l'acceptation/au refus (aucune trace
// ensuite), on garde le document avec un `status` — même pattern que
// SeatInvitation.ts (phase 4) — ce qui permet d'ajouter un "annuler ma
// demande envoyée" côté EXPÉDITEUR (absent du legacy, qui n'avait qu'un
// chemin de suppression déclenché par le DESTINATAIRE) sans rien casser.
const STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const

const friendRequestSchema = new Schema(
  {
    fromId: { type: String, required: true, index: true },
    fromName: { type: String, default: '' },
    toId: { type: String, required: true, index: true },
    status: { type: String, enum: STATUSES, required: true, default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Un seul aller-retour EN ATTENTE à la fois entre deux comptes (dans ce
// sens précis fromId→toId) — index partiel, comme SeatInvitation : l'historique
// (accepted/declined/cancelled) ne bloque jamais une nouvelle demande future.
friendRequestSchema.index({ fromId: 1, toId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })

export type FriendRequestDoc = InferSchemaType<typeof friendRequestSchema>
export type FriendRequestModel = Model<FriendRequestDoc>

export default (models.FriendRequest as FriendRequestModel) || model<FriendRequestDoc>('FriendRequest', friendRequestSchema)
