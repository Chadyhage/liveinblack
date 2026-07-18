import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Sentinelle "1 place de groupe par compte et par événement" — remplace la
// protection du legacy (une transaction Firestore Admin SDK qui re-requête
// `tickets` à l'intérieur de la transaction, explicitement documentée comme
// dépendante de garanties spécifiques au SDK Admin, non transposables telles
// quelles à Mongoose/Mongo). Ici, la contrainte est portée par un INDEX
// UNIQUE en base : {eventId, userId} ne peut exister qu'une fois, donc deux
// tentatives concurrentes de donner un siège de table à la même personne (ou
// de faire tenir/rejoindre une seconde table) échouent atomiquement au
// niveau de la base, sans dépendre d'une re-vérification applicative.
const groupMembershipSchema = new Schema(
  {
    eventId: { type: String, required: true },
    userId: { type: String, required: true },
    tableId: { type: String, required: true },
    role: { type: String, enum: ['host', 'member'], required: true },
    ticketCode: { type: String, required: true },
  },
  { timestamps: true }
)

groupMembershipSchema.index({ eventId: 1, userId: 1 }, { unique: true })

export type GroupMembershipDoc = InferSchemaType<typeof groupMembershipSchema>
export type GroupMembershipModel = Model<GroupMembershipDoc>

export default (models.GroupMembership as GroupMembershipModel) || model<GroupMembershipDoc>('GroupMembership', groupMembershipSchema)
