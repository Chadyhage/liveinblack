import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Conversation, { type ConversationDoc } from '../models/Conversation'
import Message from '../models/Message'
import User from '../models/User'
import { uploadDataUri } from './cloudinary'
import {
  toConversationView,
  normalizeObjectId,
  resolveDisplayName,
  loadParticipantConversation,
  type MessagingCaller,
  type ConversationView,
} from './messaging'

// Port du cycle de vie des groupes de src/utils/messaging.js
// (createGroup/leaveGroup/deleteGroup/setGroupMemberMute/clearGroupMemberMute/
// updateGroupInfo/handleAddMember/handleRemoveMember/handleSetAdmin) vers le
// modèle Mongo un-document-par-conversation (lib/models/Conversation.ts) déjà
// en place pour la messagerie de base (lib/server/messaging.ts, #40).
//
// Correction (#50) : une précédente version de ce fichier affirmait ICI que
// "l'admin ajoute/retire un membre" n'existait pas dans le legacy — c'était
// FAUX (MessagingPage.jsx implémente bel et bien handleAddMember/
// handleRemoveMember/handleSetAdmin avec UI complète). addMember/removeMember/
// setMemberRole ci-dessous portent cette capacité fidèlement.
//
// `memberMuteUntil` (lib/models/Conversation.ts) porte désormais une VRAIE
// expiration temporisée (comme le `memberMutes: {[memberId]: {untilAtMs,...}}`
// legacy) — `mutedUserIds` reste un cache d'affichage dérivé, jamais la
// source de vérité (voir resolveMemberMuteStatus, lib/server/messaging.ts).

// ─────────────────────────── gardes partagées ─────────────────────────────

type ErrResult = { ok: false; status: number; error: string }

// Sous-type dérivé de ConversationDoc plutôt que redéfini à la main : reste
// automatiquement synchronisé si memberSchema (lib/models/Conversation.ts)
// change un jour.
type ConversationMember = NonNullable<ConversationDoc['members']>[number]

type GroupGuardResult = ErrResult | { ok: true; conversation: HydratedDocument<ConversationDoc>; members: ConversationMember[] }

// Garde PARTAGÉE par toute action de groupe : réutilise loadParticipantConversation
// (messaging.ts) pour existence+appartenance, puis vérifie EN PLUS que
// `type === 'group'`. Une conversation directe échoue avec EXACTEMENT le même
// 404 générique qu'une conversation inexistante ou une non-appartenance —
// jamais un code distinct qui laisserait un appelant deviner qu'elle existe
// bel et bien, juste pas de type 'group' (même raisonnement de confidentialité
// que loadParticipantConversation lui-même).
async function loadGroupConversation(callerId: string, conversationId: string): Promise<GroupGuardResult> {
  const guard = await loadParticipantConversation(conversationId, callerId)
  if (!guard.ok) return guard
  const { conversation } = guard
  if (conversation.type !== 'group' || !conversation.members) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }
  return { ok: true, conversation, members: conversation.members }
}

// Garde PARTAGÉE par toute action RÉSERVÉE AUX ADMINS (deleteGroup,
// muteMember, unmuteMember) : au-dessus de loadGroupConversation, exige que
// l'entrée `members[]` de l'appelant ait le rôle 'admin'. 403 (pas 404) ici —
// l'appelant a DÉJÀ passé la vérification d'appartenance ci-dessus, donc lui
// répondre "tu es bien dans ce groupe, juste pas admin" ne lui apprend rien
// qu'il ne sache déjà ; c'est un cas distinct de "non-participant", qui lui
// reste un 404 générique.
async function loadGroupAsAdmin(caller: MessagingCaller, conversationId: string): Promise<GroupGuardResult> {
  const guard = await loadGroupConversation(caller.id, conversationId)
  if (!guard.ok) return guard
  const { members } = guard
  const callerMember = members.find((m) => m.userId === caller.id)
  if (callerMember?.role !== 'admin') return { ok: false, status: 403, error: 'admin_only' }
  return guard
}

// ──────────────────────────────── createGroup ──────────────────────────────

export interface CreateGroupInput {
  name: string
  memberUserIds: string[]
}

export type CreateGroupResult = ErrResult | { ok: true; conversation: ConversationView }

const MAX_GROUP_NAME_LEN = 100
const MAX_OTHER_MEMBERS = 49

export async function createGroup(caller: MessagingCaller, input: CreateGroupInput): Promise<CreateGroupResult> {
  await getDb()

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return { ok: false, status: 400, error: 'group_name_required' }
  if (name.length > MAX_GROUP_NAME_LEN) return { ok: false, status: 400, error: 'group_name_too_long' }

  const rawIds = Array.isArray(input.memberUserIds) ? input.memberUserIds : []

  // Normalisé (casse ObjectId) AVANT dédoublonnage/comparaison à l'appelant —
  // voir normalizeObjectId (messaging.ts) : sans ça, deux graphies du même
  // compte compteraient comme deux membres distincts, ou l'id de l'appelant
  // soumis dans une casse différente échapperait au drop silencieux ci-dessous.
  // Un id mal formé (pas un ObjectId valide) est traité comme "pas un vrai
  // utilisateur" (404 user_not_found), jamais comme un CastError — même
  // convention que createDirectConversation dans messaging.ts.
  const normalizedIds: string[] = []
  for (const raw of rawIds) {
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (!trimmed) continue
    if (!mongoose.isValidObjectId(trimmed)) return { ok: false, status: 404, error: 'user_not_found' }
    normalizedIds.push(normalizeObjectId(trimmed))
  }

  // L'id de l'appelant, s'il figure dans la liste, est une maladresse cliente
  // inoffensive (il est déjà implicitement membre de son propre groupe) — on
  // le retire en silence plutôt que de rejeter toute la requête pour ça.
  const distinctOtherIds = [...new Set(normalizedIds.filter((id) => id !== caller.id))]

  if (distinctOtherIds.length > MAX_OTHER_MEMBERS) return { ok: false, status: 400, error: 'too_many_members' }

  const others = await User.find({ _id: { $in: distinctOtherIds } }).lean()
  if (others.length !== distinctOtherIds.length) return { ok: false, status: 404, error: 'user_not_found' }

  // Caller + autres membres valides : un "groupe" d'une seule personne (soi-même)
  // n'a pas de sens (fidèle au legacy, qui n'a jamais permis de créer un
  // groupe sans au moins un autre membre).
  if (1 + distinctOtherIds.length < 2) return { ok: false, status: 400, error: 'not_enough_members' }

  // Noms TOUJOURS résolus depuis de vrais documents User — jamais depuis une
  // valeur fournie par le client (même garde-fou que le reste de la messagerie).
  const callerName = await resolveDisplayName(caller.id)
  const othersById = new Map(others.map((u) => [String(u._id), u]))
  const members = [
    { userId: caller.id, name: callerName, role: 'admin' as const },
    ...distinctOtherIds.map((id) => {
      const user = othersById.get(id)
      const memberName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : ''
      return { userId: id, name: memberName, role: 'member' as const }
    }),
  ]

  const conversation = await Conversation.create({
    type: 'group',
    participantIds: [caller.id, ...distinctOtherIds],
    members,
    name,
    mutedUserIds: [],
  })

  // Message SYSTÈME annonçant la création — PAS via sendMessage (messaging.ts),
  // qui interdit explicitement type:'system' (réservé aux annonces serveur).
  // Le document Message est donc créé directement ici.
  const systemContent = `${callerName} a créé le groupe`
  const systemMessage = await Message.create({
    conversationId: conversation.id as string,
    senderId: caller.id,
    senderName: callerName,
    type: 'system',
    content: systemContent,
  })

  // Même convention que sendMessage (messaging.ts) : la conversation reflète
  // toujours son dernier message, y compris un message système.
  conversation.lastMessage = systemContent
  conversation.lastMessageAt = systemMessage.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()

  return {
    ok: true,
    conversation: toConversationView(conversation.toObject({ flattenMaps: true }) as unknown as Parameters<typeof toConversationView>[0]),
  }
}

// ───────────────────────────────── leaveGroup ──────────────────────────────

export interface ConversationIdInput {
  conversationId: string
}

export type LeaveGroupResult = ErrResult | { ok: true; deleted: boolean }

export async function leaveGroup(caller: MessagingCaller, input: ConversationIdInput): Promise<LeaveGroupResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  // Pré-vérification non-transactionnelle (existence + appartenance + type
  // 'group') : évite d'ouvrir une transaction pour le cas très majoritaire
  // d'un appelant invalide. La garde RÉELLE contre la course avec un AUTRE
  // membre quittant EN MÊME TEMPS est la relecture fraîche DANS la
  // transaction ci-dessous — jamais celle-ci seule.
  const guard = await loadGroupConversation(caller.id, conversationId)
  if (!guard.ok) return guard
  const conversationId_ = guard.conversation._id

  const session = await mongoose.startSession()
  let deleted = false
  try {
    await session.withTransaction(async () => {
      const fresh = await Conversation.findById(conversationId_).session(session)
      if (!fresh || fresh.type !== 'group' || !fresh.members) {
        // Course : un autre `leaveGroup` concurrent a déjà supprimé le
        // groupe entre notre garde (hors transaction) et cette relecture —
        // notre propre départ est de fait déjà satisfait (le groupe n'existe
        // plus, on ne peut donc plus y figurer).
        deleted = true
        return
      }
      const leavingIndex = fresh.members.findIndex((m) => m.userId === caller.id)
      if (leavingIndex === -1) {
        // Un autre appel concurrent nous a déjà retirés de ce groupe (double
        // appel du même utilisateur, ou état déjà à jour) — succès
        // idempotent, rien de plus à faire.
        return
      }

      // Mutation EN PLACE du DocumentArray (splice), plutôt qu'une
      // réaffectation par un tableau d'objets simples : `members` reste un
      // vrai DocumentArray Mongoose de bout en bout (le typage généré par
      // InferSchemaType n'accepte pas un `T[]` brut en réaffectation directe),
      // et `.splice()` marque correctement le chemin comme modifié pour `.save()`.
      const leaving = fresh.members[leavingIndex]
      const wasAdmin = leaving.role === 'admin'
      const leavingName = leaving.name || (await resolveDisplayName(caller.id))
      fresh.members.splice(leavingIndex, 1)

      if (fresh.members.length === 0) {
        // Groupe vidé par ce départ : supprime la conversation ET tous ses
        // messages dans LA MÊME transaction — un crash entre les deux ne
        // peut jamais laisser de messages orphelins sans conversation, ni
        // l'inverse (voir en-tête de fichier / instructions de la tâche).
        await Conversation.deleteOne({ _id: fresh._id }, { session })
        await Message.deleteMany({ conversationId: String(fresh._id) }, { session })
        deleted = true
        return
      }

      // Auto-promotion : si l'appelant qui part était le SEUL admin, le
      // premier membre restant (ordre d'origine du tableau) devient admin —
      // fidèle au legacy (leaveGroup, src/utils/messaging.js).
      let promotedName: string | null = null
      if (wasAdmin && !fresh.members.some((m) => m.role === 'admin')) {
        fresh.members[0].role = 'admin'
        promotedName = fresh.members[0].name
      }

      const systemContent = promotedName
        ? `${leavingName} a quitté le groupe (${promotedName} devient administrateur)`
        : `${leavingName} a quitté le groupe`

      const [systemMessage] = await Message.create(
        [{ conversationId: String(fresh._id), senderId: caller.id, senderName: leavingName, type: 'system', content: systemContent }],
        { session }
      )

      fresh.participantIds = fresh.members.map((m) => m.userId)
      fresh.lastMessage = systemContent
      fresh.lastMessageAt = systemMessage.createdAt as unknown as Date
      fresh.lastSenderId = caller.id
      await fresh.save({ session })
    })
  } finally {
    await session.endSession()
  }

  return { ok: true, deleted }
}

// ──────────────────────────────── deleteGroup ──────────────────────────────

export type DeleteGroupResult = ErrResult | { ok: true }

export async function deleteGroup(caller: MessagingCaller, input: ConversationIdInput): Promise<DeleteGroupResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation } = guard

  // Même raisonnement que le cas "groupe vidé" de leaveGroup : conversation
  // ET messages supprimés dans LA MÊME transaction.
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await Conversation.deleteOne({ _id: conversation._id }, { session })
      await Message.deleteMany({ conversationId: String(conversation._id) }, { session })
    })
  } finally {
    await session.endSession()
  }

  return { ok: true }
}

// ────────────────────────── muteMember / unmuteMember ──────────────────────

export interface MuteMemberInput {
  conversationId: string
  targetUserId: string
  // null = sourdine indéfinie ("jusqu'à réactivation") ; sinon durée en ms
  // depuis maintenant — voir GROUP_MUTE_DURATIONS (legacy MessagingPage.jsx :
  // 15 min / 1 h / 8 h / 24 h / 7 jours / indéfini).
  durationMs: number | null
}

export type MuteMemberResult = ErrResult | { ok: true; untilAtMs: number | null }

export async function muteMember(caller: MessagingCaller, input: MuteMemberInput): Promise<MuteMemberResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const targetUserId = input.targetUserId?.trim()
  if (!conversationId || !targetUserId) return { ok: false, status: 400, error: 'invalid_input' }
  if (input.durationMs !== null && (!Number.isFinite(input.durationMs) || input.durationMs <= 0)) {
    return { ok: false, status: 400, error: 'invalid_duration' }
  }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  // Tableau `members` déjà chargé par la garde ci-dessus — aucun aller-retour
  // base de données supplémentaire nécessaire pour cette vérification.
  const target = members.find((m) => m.userId === targetUserId)
  if (!target) return { ok: false, status: 400, error: 'not_a_member' }
  // Un admin ne peut pas mettre en sourdine un AUTRE admin — même règle que
  // le legacy (setGroupMemberMute : "un administrateur ne peut pas réduire au
  // silence un autre administrateur"), quel que soit l'admin qui la tente.
  if (target.role === 'admin') return { ok: false, status: 400, error: 'target_is_admin' }

  const untilAtMs = input.durationMs === null ? null : Date.now() + input.durationMs
  const untilValue = untilAtMs === null ? '' : new Date(untilAtMs).toISOString()

  // $addToSet : idempotent, une seconde mise en sourdine du même membre est
  // un no-op silencieux plutôt qu'une erreur ou un doublon. memberMuteUntil
  // est la source de vérité (resolveMemberMuteStatus, messaging.ts) —
  // mutedUserIds n'est qu'un cache d'affichage tenu à jour en même temps.
  await Conversation.updateOne(
    { _id: conversation._id },
    { $addToSet: { mutedUserIds: targetUserId }, $set: { [`memberMuteUntil.${targetUserId}`]: untilValue } }
  )
  return { ok: true, untilAtMs }
}

export async function unmuteMember(caller: MessagingCaller, input: { conversationId: string; targetUserId: string }): Promise<ErrResult | { ok: true }> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const targetUserId = input.targetUserId?.trim()
  if (!conversationId || !targetUserId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  // Contrairement à muteMember, PAS de check not_a_member/target_is_admin
  // ici : lever une sourdine reste un no-op idempotent pour QUICONQUE n'est
  // plus (ou n'a jamais été) mute — fidèle au legacy (clearGroupMemberMute),
  // qui ne validait que le rôle admin de l'appelant, jamais l'état du membre
  // ciblé. C'est muteMember, l'action qui produit un effet NOUVEAU à
  // contrôler, qui porte ces vérifications.
  await Conversation.updateOne(
    { _id: guard.conversation._id },
    { $pull: { mutedUserIds: targetUserId }, $unset: { [`memberMuteUntil.${targetUserId}`]: '' } }
  )
  return { ok: true }
}

// ─────────────────────── addMember / removeMember / setMemberRole ─────────

const MAX_MEMBERS_TOTAL = MAX_OTHER_MEMBERS + 1

export interface AddMemberInput {
  conversationId: string
  userId: string
}

export type AddMemberResult = ErrResult | { ok: true; conversation: ConversationView }

export async function addMember(caller: MessagingCaller, input: AddMemberInput): Promise<AddMemberResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const userIdRaw = input.userId?.trim()
  if (!conversationId || !userIdRaw) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(userIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }
  const userId = normalizeObjectId(userIdRaw)

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  if (members.some((m) => m.userId === userId)) return { ok: false, status: 400, error: 'already_a_member' }
  if (members.length >= MAX_MEMBERS_TOTAL) return { ok: false, status: 400, error: 'too_many_members' }

  const user = await User.findById(userId).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }
  const memberName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email

  conversation.members!.push({ userId, name: memberName, role: 'member' })
  conversation.participantIds = conversation.members!.map((m) => m.userId)

  const callerName = await resolveDisplayName(caller.id)
  const systemContent = `${callerName} a ajouté ${memberName}`
  const systemMessage = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName: callerName,
    type: 'system',
    content: systemContent,
  })
  conversation.lastMessage = systemContent
  conversation.lastMessageAt = systemMessage.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()

  return {
    ok: true,
    conversation: toConversationView(conversation.toObject({ flattenMaps: true }) as unknown as Parameters<typeof toConversationView>[0]),
  }
}

export interface RemoveMemberInput {
  conversationId: string
  userId: string
}

export type RemoveMemberResult = ErrResult | { ok: true }

export async function removeMember(caller: MessagingCaller, input: RemoveMemberInput): Promise<RemoveMemberResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const userId = input.userId?.trim()
  if (!conversationId || !userId) return { ok: false, status: 400, error: 'invalid_input' }
  // Se retirer soi-même passe par leaveGroup (messaging.ts) — pas ce chemin,
  // qui suppose une cible DISTINCTE de l'appelant.
  if (userId === caller.id) return { ok: false, status: 400, error: 'cannot_remove_self' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  const idx = members.findIndex((m) => m.userId === userId)
  if (idx === -1) return { ok: false, status: 400, error: 'not_a_member' }
  const removedName = members[idx].name

  conversation.members!.splice(idx, 1)
  conversation.participantIds = conversation.members!.map((m) => m.userId)

  const callerName = await resolveDisplayName(caller.id)
  const systemContent = `${removedName} a été retiré du groupe`
  const systemMessage = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName: callerName,
    type: 'system',
    content: systemContent,
  })
  conversation.lastMessage = systemContent
  conversation.lastMessageAt = systemMessage.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  // Nettoyage : un membre retiré ne doit garder aucune sourdine résiduelle.
  conversation.mutedUserIds = conversation.mutedUserIds.filter((id) => id !== userId)
  if (conversation.memberMuteUntil) conversation.memberMuteUntil.delete(userId)
  await conversation.save()

  return { ok: true }
}

export interface SetMemberRoleInput {
  conversationId: string
  userId: string
  role: 'admin' | 'member'
}

export type SetMemberRoleResult = ErrResult | { ok: true }

export async function setMemberRole(caller: MessagingCaller, input: SetMemberRoleInput): Promise<SetMemberRoleResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const userId = input.userId?.trim()
  const role = input.role
  if (!conversationId || !userId || (role !== 'admin' && role !== 'member')) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  const target = members.find((m) => m.userId === userId)
  if (!target) return { ok: false, status: 400, error: 'not_a_member' }
  if (target.role === role) return { ok: true }

  if (target.role === 'admin' && role === 'member') {
    const adminCount = members.filter((m) => m.role === 'admin').length
    // Garde ajoutée délibérément AU-DELÀ du legacy (qui ne la vérifiait
    // jamais) : un groupe ne doit jamais se retrouver sans AUCUN admin —
    // sinon plus personne ne peut plus jamais le gérer (rôles, sourdines,
    // suppression...).
    if (adminCount <= 1) return { ok: false, status: 400, error: 'only_admin' }
  }

  target.role = role
  const callerName = await resolveDisplayName(caller.id)
  const systemContent = role === 'admin' ? `${callerName} a nommé ${target.name} administrateur` : `${callerName} a retiré le rôle Admin à ${target.name}`
  const systemMessage = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName: callerName,
    type: 'system',
    content: systemContent,
  })
  conversation.lastMessage = systemContent
  conversation.lastMessageAt = systemMessage.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()
  return { ok: true }
}

// ───────────────────────── renameGroup / setGroupAvatar ────────────────────

export interface RenameGroupInput {
  conversationId: string
  name: string
}

export type RenameGroupResult = ErrResult | { ok: true; name: string }

export async function renameGroup(caller: MessagingCaller, input: RenameGroupInput): Promise<RenameGroupResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const name = input.name?.trim()
  if (!conversationId || !name) return { ok: false, status: 400, error: 'group_name_required' }
  if (name.length > MAX_GROUP_NAME_LEN) return { ok: false, status: 400, error: 'group_name_too_long' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation } = guard
  if (conversation.name === name) return { ok: true, name }

  conversation.name = name
  const callerName = await resolveDisplayName(caller.id)
  const systemContent = `${callerName} a renommé le groupe en "${name}"`
  const systemMessage = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName: callerName,
    type: 'system',
    content: systemContent,
  })
  conversation.lastMessage = systemContent
  conversation.lastMessageAt = systemMessage.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()
  return { ok: true, name }
}

export interface SetGroupAvatarInput {
  conversationId: string
  dataUri: string
}

export type SetGroupAvatarResult = ErrResult | { ok: true; avatar: string }

export async function setGroupAvatar(caller: MessagingCaller, input: SetGroupAvatarInput): Promise<SetGroupAvatarResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const dataUri = input.dataUri
  if (!conversationId || !dataUri) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const uploaded = await uploadDataUri(dataUri, `groups/${String(guard.conversation._id)}`)
  if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }

  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { avatar: uploaded.url } })
  return { ok: true, avatar: uploaded.url }
}

// ───────────────────────────── pinMessage / unpinMessage ───────────────────
// Épingler un message reste réservé aux ADMINS de groupe — le legacy ne
// propose jamais cette entrée de menu sur une conversation directe
// (`amAdmin` conditionne l'item, toujours faux hors groupe).

export interface PinMessageInput {
  conversationId: string
  messageId: string
}

export type PinMessageResult = ErrResult | { ok: true }

export async function pinMessage(caller: MessagingCaller, input: PinMessageInput): Promise<PinMessageResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  const messageId = input.messageId?.trim()
  if (!conversationId || !messageId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const message = await Message.findOne({ _id: messageId, conversationId })
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }

  await Promise.all([
    Conversation.updateOne({ _id: guard.conversation._id }, { $set: { pinnedMessageId: String(message._id) } }),
    Message.updateOne({ _id: message._id }, { $set: { pinned: true } }),
  ])
  return { ok: true }
}

export async function unpinMessage(caller: MessagingCaller, input: ConversationIdInput): Promise<PinMessageResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const pinnedId = guard.conversation.pinnedMessageId
  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { pinnedMessageId: null } })
  if (pinnedId) await Message.updateOne({ _id: pinnedId }, { $set: { pinned: false } })
  return { ok: true }
}

export interface ConversationIdInput {
  conversationId: string
}
