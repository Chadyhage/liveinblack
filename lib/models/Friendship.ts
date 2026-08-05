import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `user_social/{uid}.friends` (Firestore, un tableau dupliqué sur
// CHAQUE compte des deux côtés — deux écritures pour une seule relation,
// exactement le motif "tableau dans un document" que l'audit signale comme
// source de contention à l'échelle, cf. AUDIT_TECHNIQUE_PRODUCTION.md ligne
// 246). Ici, une amitié = UN document, une seule écriture pour la créer/la
// retirer. `userAId`/`userBId` sont toujours stockés triés (ordre
// lexicographique de la string) — cf. lib/server/friends.ts — pour qu'une
// paire (X,Y) ne puisse jamais exister deux fois dans des sens opposés.
const friendshipSchema = new Schema(
  {
    userAId: { type: String, required: true },
    userBId: { type: String, required: true },
  },
  { timestamps: true }
)

friendshipSchema.index({ userAId: 1, userBId: 1 }, { unique: true })
friendshipSchema.index({ userBId: 1 })

export type FriendshipDoc = InferSchemaType<typeof friendshipSchema>
export type FriendshipModel = Model<FriendshipDoc>

export default (models.Friendship as FriendshipModel) || model<FriendshipDoc>('Friendship', friendshipSchema)
