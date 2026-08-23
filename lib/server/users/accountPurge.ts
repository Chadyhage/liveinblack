import crypto from 'node:crypto'
import type { ClientSession } from 'mongoose'
import Application from '../models/Application'
import OrganizerProfile from '../models/OrganizerProfile'
import ProviderProfile from '../models/ProviderProfile'
import GroupMembership from '../models/GroupMembership'
import Friendship from '../models/Friendship'
import FriendRequest from '../models/FriendRequest'
import OrganizerFollow from '../models/OrganizerFollow'
import EventInterest from '../models/EventInterest'
import SeatInvitation from '../models/SeatInvitation'
import Ticket from '../models/Ticket'
import Conversation from '../models/Conversation'
import Message from '../models/Message'
import Report from '../models/Report'
import Review from '../models/Review'
import ReviewReport from '../models/ReviewReport'

// Purge PII partagée entre les DEUX chemins de suppression de compte :
// lib/server/profile.ts:deleteAccount (auto-suppression — client, agent, ou
// organisateur/prestataire dont orgStatus/prestStatus n'est pas encore
// 'active') ET lib/server/agentDeletion.ts:approveDeletion (revue agent d'un
// organisateur/prestataire APPROUVÉ). Extrait de l'ancienne implémentation
// monolithique d'approveDeletion (seul chemin à avoir jamais fait cette purge
// en cascade) — deleteAccount n'anonymisait auparavant QUE le document User
// lui-même, laissant son nom/prénom traîner dans Message.senderName,
// Conversation.members[].name, FriendRequest, Report, Review.authorName,
// Ticket assigné/invité, GroupMembership, SeatInvitation, OrganizerFollow,
// EventInterest, Friendship, ainsi que tout dossier de candidature/profil
// brouillon (avec pièces d'identité hébergées sur Cloudinary) — un manquement
// RGPD critique puisque c'est la voie empruntée par CHAQUE client, CHAQUE
// agent, et tout organisateur/prestataire pas encore actif.
//
// Volontairement HORS de cette fonction (reste spécifique à chaque appelant) :
//  - Les Event de l'utilisateur (purge/anonymisation) : dépend d'un AUDIT de
//    blocage (billets vendus...) propre au workflow d'approbation agent — un
//    compte non encore actif ne peut de toute façon pas avoir créé
//    d'événement (proxy.ts redirige tout organisateur/prestataire
//    orgStatus/prestStatus !== 'active' vers /mon-dossier avant qu'il puisse
//    atteindre la création d'événement).
//  - La résiliation d'abonnement Stripe (agentDeletion.ts, AVANT la
//    transaction) et les champs additionnels roles/orgStatus/prestStatus/
//    stripe* propres à approveDeletion.
//  - L'anonymisation du document User lui-même (email/nom/mot de passe/
//    disabled/sessionVersion) : les deux appelants la font déjà à l'identique
//    (voir le commentaire d'en-tête de deleteAccount) ; laissée dans chaque
//    fonction pour que le comportement `disabled`/`sessionVersion` de
//    deleteAccount reste inchangé au bit près.
//
// DOIT être appelée à l'intérieur d'une transaction Mongo existante
// (session.withTransaction) — aucune des écritures ci-dessous n'ouvre ou ne
// commite de session elle-même.
export async function scrubAccountPII(uid: string, session: ClientSession): Promise<void> {
  const now = new Date()

  // 1. Vitrines publiques — aucune valeur financière/d'audit, retirées
  //    entièrement (RGPD, symétrique du legacy deleteDoc providers/catalogs/
  //    organizer_profiles). Couvre aussi bien un profil publié qu'un profil
  //    encore `status: 'draft'` (créé au premier accès au studio, avant même
  //    l'approbation du dossier).
  await OrganizerProfile.deleteOne({ userId: uid }, { session })
  await ProviderProfile.deleteOne({ userId: uid }, { session })

  // 2. Dossier de candidature — purement personnel (nom commercial,
  //    téléphone, pièces d'identité hébergées sur Cloudinary), qu'il soit
  //    encore en brouillon/à l'étude ou déjà approuvé.
  await Application.deleteMany({ userId: uid }, { session })

  // 3. Registre anti-hoarding des places de groupe — pur index, aucune
  //    valeur propre (Ticket reste la source de vérité de la place).
  await GroupMembership.deleteMany({ userId: uid }, { session })

  // 4. Sièges de table détenus dans un événement d'un AUTRE organisateur (#79,
  //    registre anti-fraude). Hôte supprimé → sièges révoqués (plus personne
  //    pour gérer la table). Invité supprimé → siège rendu à l'hôte,
  //    seatVersion/entryNonce roulés pour invalider l'ancien QR.
  const hostedTickets = await Ticket.find({ hostUid: uid, revoked: { $ne: true } }).session(session)
  for (const t of hostedTickets) {
    t.revoked = true
    await t.save({ session })
  }
  const heldSeats = await Ticket.find({ userId: uid, hostUid: { $ne: null }, revoked: { $ne: true } }).session(session)
  for (const t of heldSeats) {
    if (!t.hostUid || t.hostUid === uid) continue
    t.userId = t.hostUid
    t.assignedTo = null
    t.assignedName = null
    t.seatVersion = (t.seatVersion || 0) + 1
    t.entryNonce = crypto.randomBytes(12).toString('hex')
    await t.save({ session })
  }
  // Nom affiché au titulaire ACTUEL d'un siège que le compte supprimé
  // continue de tenir (assignedTo === uid, hôte différent) : scrubé.
  await Ticket.updateMany({ assignedTo: uid }, { $set: { assignedName: 'Compte supprimé' } }, { session })

  // 5. Invitations de siège en attente émises par l'hôte supprimé — annulées
  //    (rien à attribuer sans hôte).
  await SeatInvitation.updateMany({ hostUid: uid, status: 'pending' }, { $set: { status: 'cancelled', respondedAt: now } }, { session })

  // 6. Relations sociales — aucune valeur financière/d'audit.
  await Friendship.deleteMany({ $or: [{ userAId: uid }, { userBId: uid }] }, { session })
  await FriendRequest.deleteMany({ $or: [{ fromId: uid }, { toId: uid }] }, { session })
  await OrganizerFollow.deleteMany({ $or: [{ userId: uid }, { organizerId: uid }] }, { session })
  await EventInterest.deleteMany({ userId: uid }, { session })

  // 7. Messagerie — retirer le membre supprimé de chaque conversation (jamais
  //    supprimer la conversation : l'historique appartient aussi aux AUTRES
  //    participants) ; promouvoir un nouvel admin si un groupe se retrouve
  //    sans aucun (même règle que le legacy #18).
  const conversations = await Conversation.find({ participantIds: uid }).session(session)
  for (const conv of conversations) {
    conv.participantIds = conv.participantIds.filter((id) => id !== uid)
    if (conv.members) {
      const idx = conv.members.findIndex((m) => m.userId === uid)
      if (idx !== -1) {
        const wasAdmin = conv.members[idx].role === 'admin'
        conv.members.splice(idx, 1)
        if (conv.type === 'group' && wasAdmin && conv.members.length > 0 && !conv.members.some((m) => m.role === 'admin')) {
          conv.members[0].role = 'admin'
        }
      }
    }
    conv.mutedUserIds = conv.mutedUserIds.filter((id) => id !== uid)
    conv.pinnedByUserIds = conv.pinnedByUserIds.filter((id) => id !== uid)
    conv.hiddenByUserIds = conv.hiddenByUserIds.filter((id) => id !== uid)
    conv.mutedConversationByUserIds = conv.mutedConversationByUserIds.filter((id) => id !== uid)
    conv.lastReadAt?.delete(uid)
    conv.typingAt?.delete(uid)

    if (conv.participantIds.length === 0) {
      await Conversation.deleteOne({ _id: conv._id }, { session })
      await Message.deleteMany({ conversationId: String(conv._id) }, { session })
    } else {
      await conv.save({ session })
    }
  }
  await Message.updateMany({ senderId: uid }, { $set: { senderName: 'Compte supprimé' } }, { session })

  // 8. Signalements / avis — jamais supprimés (traçabilité de modération /
  //    note publique conservée), seule l'identité dénormalisée affichée est
  //    scrubée.
  await Report.updateMany({ fromId: uid }, { $set: { fromName: 'Compte supprimé' } }, { session })
  await Report.updateMany({ targetId: uid }, { $set: { targetName: 'Compte supprimé' } }, { session })
  await Review.updateMany({ authorId: uid }, { $set: { authorName: 'Utilisateur supprimé' } }, { session })
  await ReviewReport.updateMany({ reporterId: uid }, { $set: { reporterName: '' } }, { session })
}
