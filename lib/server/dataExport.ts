import { getDb } from '../db/mongoose'
import User from '../models/User'
import Ticket from '../models/Ticket'
import Order from '../models/Order'
import Conversation from '../models/Conversation'
import Message from '../models/Message'
import FriendRequest from '../models/FriendRequest'
import Friendship from '../models/Friendship'
import Review from '../models/Review'
import EventInterest from '../models/EventInterest'
import OrganizerFollow from '../models/OrganizerFollow'
import Application from '../models/Application'
import OrganizerProfile from '../models/OrganizerProfile'
import ProviderProfile from '../models/ProviderProfile'

// Art. 15 (droit d'accès) + Art. 20 (droit à la portabilité) RGPD — export
// "Télécharger mes données" en self-service, appelé par
// app/api/profil/export/route.ts. Avant ce module, exercer ces deux droits
// n'avait AUCUN mécanisme réel dans ce port (voir app/(public)/confidentialite
// /page.tsx section « Comment exercer vos droits », qui ne promettait qu'un
// e-mail) — corrigé ici.
//
// Portée volontairement scopée sur ce que CE compte peut légitimement
// recevoir sans exposer les données d'un tiers :
//  - Conversations : métadonnées de la conversation (participants, type,
//    horodatages) + le CONTENU des messages ENVOYÉS PAR L'APPELANT
//    uniquement. Les messages envoyés par les autres participants d'une
//    conversation ne sont jamais inclus, même si l'appelant peut les LIRE
//    dans l'app — leur contenu est une donnée personnelle de leur auteur,
//    pas de l'appelant ; ce module n'exporte que ce dont l'appelant est
//    lui-même la source. C'est un choix de portée délibéré, pas un oubli.
//  - Amitiés / demandes d'ami / avis / intérêts événement / abonnements
//    organisateur : toujours filtrés sur l'identité de l'appelant (userId,
//    fromId/toId, userAId/userBId, authorId) — jamais un scan global.
//  - Dossier(s) de candidature (organisateur/prestataire) et profils publics
//    (OrganizerProfile/ProviderProfile) : uniquement ceux qui appartiennent
//    à l'appelant (userId), s'ils existent.
//  - Le document User lui-même : jamais `passwordHash` (jamais un hash de
//    mot de passe dans un export, même haché). `sessionVersion` et
//    `pendingFedapaySubTxnId` sont des compteurs/jetons internes de
//    fonctionnement (pas des données personnelles au sens RGPD) et sont
//    également exclus.

export interface ExportCaller {
  id: string
}

// Normalise récursivement un document Mongoose lean() en JSON strictement
// sérialisable : Date -> ISO string, Map -> objet plain, ObjectId/Buffer ->
// string. Volontairement générique plutôt que de faire confiance à
// JSON.stringify nu sur les documents lean() — un champ `Map` (ex.
// `payoutMomos`, `lastReadAt`) survit rarement intact à un JSON.stringify
// direct selon la version de mongoose (peut sérialiser en `{}` vide).
function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of value.entries()) obj[k] = toPlain(v)
    return obj
  }
  if (Array.isArray(value)) return value.map(toPlain)
  if (typeof value === 'object') {
    const maybeObjectId = value as { toHexString?: () => string; _bsontype?: string }
    if (typeof maybeObjectId.toHexString === 'function' || typeof maybeObjectId._bsontype === 'string') {
      return String(value)
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v)
    return out
  }
  return value
}

export interface MyDataExport {
  exportedAt: string
  scopeNotes: {
    messages: string
  }
  account: Record<string, unknown>
  tickets: unknown[]
  orders: unknown[]
  conversations: unknown[]
  friendRequests: unknown[]
  friendships: unknown[]
  reviewsAuthored: unknown[]
  eventInterests: unknown[]
  organizerFollows: unknown[]
  applications: unknown[]
  organizerProfile: unknown | null
  providerProfile: unknown | null
}

export async function buildMyDataExport(caller: ExportCaller): Promise<MyDataExport | null> {
  await getDb()

  const user = await User.findById(caller.id).lean()
  if (!user) return null

  const [
    tickets,
    orders,
    conversations,
    friendRequests,
    friendships,
    reviews,
    eventInterests,
    organizerFollows,
    applications,
    organizerProfile,
    providerProfile,
  ] = await Promise.all([
    // Billets détenus (userId) ou hébergés en tant qu'hôte de table (hostUid)
    // — mêmes deux angles que listMyTickets (lib/server/tickets.ts), mais
    // sans filtrer les billets révoqués : le droit d'accès porte sur toute
    // donnée détenue, pas seulement la vue "active" affichée par le portefeuille.
    Ticket.find({ $or: [{ userId: caller.id }, { hostUid: caller.id }] }).lean(),
    Order.find({ userId: caller.id }).lean(),
    Conversation.find({ participantIds: caller.id }).lean(),
    FriendRequest.find({ $or: [{ fromId: caller.id }, { toId: caller.id }] }).lean(),
    Friendship.find({ $or: [{ userAId: caller.id }, { userBId: caller.id }] }).lean(),
    Review.find({ authorId: caller.id }).lean(),
    EventInterest.find({ userId: caller.id }).lean(),
    OrganizerFollow.find({ userId: caller.id }).lean(),
    Application.find({ userId: caller.id }).lean(),
    OrganizerProfile.findOne({ userId: caller.id }).lean(),
    ProviderProfile.findOne({ userId: caller.id }).lean(),
  ])

  const conversationIds = conversations.map((c) => String(c._id))
  const myMessages =
    conversationIds.length > 0
      ? await Message.find({ conversationId: { $in: conversationIds }, senderId: caller.id }).sort({ createdAt: 1 }).lean()
      : []

  const messagesByConversation = new Map<string, typeof myMessages>()
  for (const m of myMessages) {
    const list = messagesByConversation.get(m.conversationId) ?? []
    list.push(m)
    messagesByConversation.set(m.conversationId, list)
  }

  const conversationsView = conversations.map((c) => {
    const convId = String(c._id)
    const { ...rest } = c as Record<string, unknown>
    return {
      ...(toPlain(rest) as Record<string, unknown>),
      id: convId,
      myMessages: (messagesByConversation.get(convId) ?? []).map((m) => toPlain(m)),
    }
  })

  const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, pendingFedapaySubTxnId: _pendingFedapaySubTxnId, ...userRest } = user as Record<string, unknown>
  void _passwordHash
  void _sessionVersion
  void _pendingFedapaySubTxnId

  const account = {
    ...(toPlain(userRest) as Record<string, unknown>),
    id: String((user as { _id: unknown })._id),
  }

  return {
    exportedAt: new Date().toISOString(),
    scopeNotes: {
      messages:
        "Pour chaque conversation à laquelle ce compte participe, seules les métadonnées de la conversation et le contenu des messages ENVOYÉS PAR CE COMPTE sont inclus — jamais le contenu des messages envoyés par les autres participants.",
    },
    account,
    tickets: tickets.map((t) => toPlain(t)),
    orders: orders.map((o) => toPlain(o)),
    conversations: conversationsView,
    friendRequests: friendRequests.map((r) => toPlain(r)),
    friendships: friendships.map((f) => toPlain(f)),
    reviewsAuthored: reviews.map((r) => toPlain(r)),
    eventInterests: eventInterests.map((i) => toPlain(i)),
    organizerFollows: organizerFollows.map((f) => toPlain(f)),
    applications: applications.map((a) => toPlain(a)),
    organizerProfile: organizerProfile ? toPlain(organizerProfile) : null,
    providerProfile: providerProfile ? toPlain(providerProfile) : null,
  }
}
