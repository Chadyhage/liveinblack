// Tests d'INTÉGRATION (vraie base MongoDB) pour la messagerie de base
// (conversations, messages, réactions, accusés de lecture, blocage/signalement)
// — voir lib/server/messaging.ts pour le détail des trois durcissements
// délibérés par rapport au legacy (C10 : appartenance vérifiée AVANT toute
// lecture/écriture de messages ; validation réelle à l'envoi ; blocage
// réellement appliqué côté serveur, y compris re-vérifié à l'envoi).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import {
  createDirectConversation,
  listMyConversations,
  getMessages,
  sendMessage,
  reactToMessage,
  markConversationRead,
  blockUser,
  unblockUser,
  reportUser,
} from '../messaging'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import User from '../../models/User'
import Report from '../../models/Report'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Promise.all([Conversation.deleteMany({}), Message.deleteMany({}), User.deleteMany({}), Report.deleteMany({})])
})

// Toujours de VRAIS documents User Mongoose avec un VRAI ObjectId `.id` —
// jamais une chaîne arbitraire (`Ticket.findById`/`User.findById` lèvent un
// CastError sur une chaîne non-ObjectId, bug déjà rencontré plusieurs fois
// dans cette migration).
async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Prenom',
    lastName: 'Nom',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

function fakeObjectId(): string {
  return new mongoose.Types.ObjectId().toString()
}

describeIntegration('messaging (intégration, vraie base) — cœur messagerie (#40)', () => {
  describe('createDirectConversation', () => {
    it('crée une conversation directe entre deux vrais utilisateurs', async () => {
      const a = await seedUser()
      const b = await seedUser()

      const result = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.conversation.type).toBe('direct')
      expect(result.conversation.participantIds.sort()).toEqual([a.id, b.id].sort())
    })

    it('un second appel retrouve la MÊME conversation (find-or-create, pas de doublon)', async () => {
      const a = await seedUser()
      const b = await seedUser()

      const first = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      expect(first.ok).toBe(true)
      if (!first.ok) return

      const second = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.conversation.id).toBe(first.conversation.id)

      // Même dans l'autre sens (b initie vers a) : même conversation.
      const third = await createDirectConversation({ id: b.id }, { otherUserId: a.id })
      expect(third.ok).toBe(true)
      if (!third.ok) return
      expect(third.conversation.id).toBe(first.conversation.id)

      const count = await Conversation.countDocuments({ type: 'direct', participantIds: { $all: [a.id, b.id] } })
      expect(count).toBe(1)
    })

    it("refuse de se contacter soi-même (cannot_message_self)", async () => {
      const a = await seedUser()
      const result = await createDirectConversation({ id: a.id }, { otherUserId: a.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_message_self')
    })

    it('refuse de se contacter soi-même même avec son propre id soumis dans une casse différente', async () => {
      // BSON ObjectId est insensible à la casse : `User.findById` résout
      // `a.id.toUpperCase()` vers LE MÊME document que `a.id`. Le self-check
      // doit donc normaliser avant de comparer, sinon cette casse contourne
      // `cannot_message_self` (voir normalizeObjectId dans messaging.ts).
      const a = await seedUser()
      const result = await createDirectConversation({ id: a.id }, { otherUserId: a.id.toUpperCase() })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_message_self')
    })

    it('refuse un destinataire inexistant (user_not_found)', async () => {
      const a = await seedUser()
      const result = await createDirectConversation({ id: a.id }, { otherUserId: fakeObjectId() })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('user_not_found')
    })

    it("refuse de CRÉER une conversation quand l'appelant a bloqué l'autre (blocked)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      await User.updateOne({ _id: a.id }, { $addToSet: { blockedUserIds: b.id } })

      const result = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('blocked')
    })

    it("refuse de CRÉER une conversation quand l'AUTRE a bloqué l'appelant (blocked, sens inverse)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      await User.updateOne({ _id: b.id }, { $addToSet: { blockedUserIds: a.id } })

      const result = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('blocked')
    })
  })

  describe('sendMessage', () => {
    it('envoie un message texte (chemin heureux)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'text', content: 'Salut !' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.message.senderId).toBe(a.id)
      expect(result.message.content).toBe('Salut !')
      expect(result.message.senderName).toBe('Prenom Nom')

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.lastMessage).toBe('Salut !')
      expect(fresh?.lastSenderId).toBe(a.id)
      expect(fresh?.lastMessageAt).toBeTruthy()
    })

    it('refuse un message vide (empty_message)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'text', content: '   ' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('empty_message')
    })

    it('refuse un message de plus de 4000 caractères (message_too_long)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'text', content: 'x'.repeat(4001) })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('message_too_long')
    })

    it("refuse un message image de plus de 2000 caractères (message_too_long) — le cap 'text' ne suffit pas", async () => {
      // Régression : le cap de longueur ne doit pas être scopé au seul
      // type 'text'. `content` pour 'image'/'voice' est documenté
      // (lib/models/Message.ts) comme une URL, jamais un blob arbitraire.
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'image', content: 'a'.repeat(2001) })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('message_too_long')
    })

    it("refuse un appelant non-participant (conversation_not_found, jamais le contenu)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: outsider.id }, { conversationId: conv.id, type: 'text', content: 'coucou' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })

    it('refuse un type hors text/image/voice (invalid_type)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'system', content: 'x' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_type')
    })

    it("refuse l'envoi d'un membre mute dans une conversation de groupe (muted)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const conv = await Conversation.create({
        type: 'group',
        participantIds: [a.id, b.id, c.id],
        members: [
          { userId: a.id, name: 'A', role: 'admin' },
          { userId: b.id, name: 'B', role: 'member' },
          { userId: c.id, name: 'C', role: 'member' },
        ],
        mutedUserIds: [b.id],
      })

      const result = await sendMessage({ id: b.id }, { conversationId: conv.id, type: 'text', content: 'salut' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('muted')

      // Un autre membre non mute peut toujours parler.
      const okResult = await sendMessage({ id: c.id }, { conversationId: conv.id, type: 'text', content: 'coucou' })
      expect(okResult.ok).toBe(true)
    })

    it("refuse l'envoi une fois qu'un blocage survient APRÈS la création de la conversation (re-check à l'envoi)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      // La conversation existait AVANT tout blocage.
      const beforeBlock = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'text', content: 'avant blocage' })
      expect(beforeBlock.ok).toBe(true)

      await User.updateOne({ _id: b.id }, { $addToSet: { blockedUserIds: a.id } })

      const afterBlock = await sendMessage({ id: a.id }, { conversationId: conv.id, type: 'text', content: 'après blocage' })
      expect(afterBlock.ok).toBe(false)
      if (afterBlock.ok) return
      expect(afterBlock.status).toBe(403)
      expect(afterBlock.error).toBe('blocked')

      // Sens inverse : c'est maintenant b (le bloqueur) qui essaie d'écrire à a.
      const reverse = await sendMessage({ id: b.id }, { conversationId: conv.id, type: 'text', content: 'x' })
      expect(reverse.ok).toBe(false)
      if (reverse.ok) return
      expect(reverse.status).toBe(403)
      expect(reverse.error).toBe('blocked')
    })
  })

  describe('getMessages', () => {
    it('pagine par curseur : `before` renvoie strictement les messages plus anciens, `hasMore` est exact', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      for (let i = 0; i < 5; i++) {
        await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: `msg ${i}` })
      }

      const page1 = await getMessages({ id: a.id }, { conversationId: conv.id, limit: 2 })
      expect(page1.ok).toBe(true)
      if (!page1.ok) return
      expect(page1.hasMore).toBe(true)
      expect(page1.messages.map((m) => m.content)).toEqual(['msg 3', 'msg 4'])

      const page2 = await getMessages({ id: a.id }, { conversationId: conv.id, limit: 2, before: page1.messages[0].id })
      expect(page2.ok).toBe(true)
      if (!page2.ok) return
      expect(page2.hasMore).toBe(true)
      expect(page2.messages.map((m) => m.content)).toEqual(['msg 1', 'msg 2'])

      const page3 = await getMessages({ id: a.id }, { conversationId: conv.id, limit: 2, before: page2.messages[0].id })
      expect(page3.ok).toBe(true)
      if (!page3.ok) return
      expect(page3.hasMore).toBe(false)
      expect(page3.messages.map((m) => m.content)).toEqual(['msg 0'])
    })

    it("refuse un appelant non-participant (404), sans jamais renvoyer le contenu", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'secret entre a et b' })

      const result = await getMessages({ id: outsider.id }, { conversationId: conv.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
      expect(JSON.stringify(result)).not.toContain('secret entre a et b')
    })

    it("ne divulgue jamais le vrai contenu d'un message supprimé pour tous (deletedForAll)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'contenu secret' })
      await Message.updateOne({ _id: msg._id }, { $set: { deletedForAll: true } })

      const result = await getMessages({ id: a.id }, { conversationId: conv.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].deletedForAll).toBe(true)
      expect(result.messages[0].content).toBeNull()
    })
  })

  describe('reactToMessage', () => {
    it('première réaction : ajoute l’emoji avec l’utilisateur dans son tableau', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: b.id, senderName: 'B', type: 'text', content: 'hello' })

      const result = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reactions).toEqual({ '👍': [a.id] })
    })

    it('même emoji une seconde fois : bascule off, la clé disparaît proprement', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: b.id, senderName: 'B', type: 'text', content: 'hello' })

      await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      const result = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reactions).toEqual({})
    })

    it('emoji différent : déplace la réaction (retirée de l’ancien, ajoutée au nouveau)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: b.id, senderName: 'B', type: 'text', content: 'hello' })

      await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      const result = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '😂' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reactions).toEqual({ '😂': [a.id] })
    })

    it('deux utilisateurs différents avec des emoji différents ne se marchent jamais dessus', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'hello' })

      await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      const result = await reactToMessage({ id: b.id }, { messageId: msg.id, emoji: '😂' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reactions).toEqual({ '👍': [a.id], '😂': [b.id] })

      // a bascule off son 👍 : le 😂 de b doit rester intact.
      const afterToggleOff = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      expect(afterToggleOff.ok).toBe(true)
      if (!afterToggleOff.ok) return
      expect(afterToggleOff.reactions).toEqual({ '😂': [b.id] })
    })

    it('deux utilisateurs différents avec le MÊME emoji : les deux voters coexistent (pas de remplacement du tableau)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'hello' })

      const first = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.reactions).toEqual({ '👍': [a.id] })

      const second = await reactToMessage({ id: b.id }, { messageId: msg.id, emoji: '👍' })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      // b vient s'ajouter au MÊME emoji que a — le voter de a ne doit jamais
      // être écrasé par celui de b (régression possible si le $filter par
      // emoji de buildReactionTogglePipeline remplaçait le tableau entier au
      // lieu de simplement en retirer l'appelant).
      expect(second.reactions['👍'].sort()).toEqual([a.id, b.id].sort())

      // a bascule off son 👍 : le voter de b sur le MÊME emoji doit rester.
      const afterAToggleOff = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: '👍' })
      expect(afterAToggleOff.ok).toBe(true)
      if (!afterAToggleOff.ok) return
      expect(afterAToggleOff.reactions).toEqual({ '👍': [b.id] })
    })

    it("refuse qu'un non-participant réagisse (message_not_found)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'hello' })

      const result = await reactToMessage({ id: outsider.id }, { messageId: msg.id, emoji: '👍' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('message_not_found')
    })

    it('refuse un emoji de taille arbitraire (invalid_emoji) — pas de clé Map non bornée sur un message partagé', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const msg = await Message.create({ conversationId: conv.id, senderId: b.id, senderName: 'B', type: 'text', content: 'hello' })

      const result = await reactToMessage({ id: a.id }, { messageId: msg.id, emoji: 'x'.repeat(1000) })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_emoji')
    })
  })

  describe('markConversationRead', () => {
    it('remet unreadCount à zéro pour CETTE conversation sans affecter les autres', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const conv1 = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      const conv2 = await Conversation.create({ type: 'direct', participantIds: [a.id, c.id] })

      for (let i = 0; i < 3; i++) {
        await sendMessage({ id: b.id }, { conversationId: conv1.id, type: 'text', content: `b dit ${i}` })
      }
      await sendMessage({ id: c.id }, { conversationId: conv2.id, type: 'text', content: 'c dit salut' })

      const before = await listMyConversations({ id: a.id })
      expect(before.ok).toBe(true)
      if (!before.ok) return
      const conv1Before = before.conversations.find((c2) => c2.id === conv1.id)
      const conv2Before = before.conversations.find((c2) => c2.id === conv2.id)
      expect(conv1Before?.unreadCount).toBe(3)
      expect(conv2Before?.unreadCount).toBe(1)

      const markResult = await markConversationRead({ id: a.id }, { conversationId: conv1.id })
      expect(markResult.ok).toBe(true)

      const after = await listMyConversations({ id: a.id })
      expect(after.ok).toBe(true)
      if (!after.ok) return
      const conv1After = after.conversations.find((c2) => c2.id === conv1.id)
      const conv2After = after.conversations.find((c2) => c2.id === conv2.id)
      expect(conv1After?.unreadCount).toBe(0)
      // L'autre conversation n'est jamais affectée par le marquage-lu de la première.
      expect(conv2After?.unreadCount).toBe(1)
    })

    it("une conversation jamais lue compte TOUS les messages de l'autre comme non lus (pas 0 par défaut)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })
      await sendMessage({ id: b.id }, { conversationId: conv.id, type: 'text', content: 'salut' })

      const result = await listMyConversations({ id: a.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const view = result.conversations.find((c) => c.id === conv.id)
      expect(view?.unreadCount).toBe(1)
    })
  })

  describe('blockUser / unblockUser', () => {
    it('bloque puis débloque un compte (idempotent, réversible)', async () => {
      const a = await seedUser()
      const b = await seedUser()

      const blockResult = await blockUser({ id: a.id }, { targetUserId: b.id })
      expect(blockResult.ok).toBe(true)
      let fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds).toContain(b.id)

      // Idempotent : un second blocage ne duplique pas l'entrée.
      await blockUser({ id: a.id }, { targetUserId: b.id })
      fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds?.filter((id) => id === b.id)).toHaveLength(1)

      const unblockResult = await unblockUser({ id: a.id }, { targetUserId: b.id })
      expect(unblockResult.ok).toBe(true)
      fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds).not.toContain(b.id)
    })

    it("refuse de se bloquer soi-même (cannot_block_self)", async () => {
      const a = await seedUser()
      const result = await blockUser({ id: a.id }, { targetUserId: a.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_block_self')
    })

    it('refuse de se bloquer soi-même même avec son propre id soumis dans une casse différente', async () => {
      const a = await seedUser()
      const result = await blockUser({ id: a.id }, { targetUserId: a.id.toUpperCase() })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_block_self')

      const fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds ?? []).toHaveLength(0)
    })

    it('débloque un compte même si targetUserId est soumis dans une casse différente de la valeur stockée', async () => {
      const a = await seedUser()
      const b = await seedUser()

      await blockUser({ id: a.id }, { targetUserId: b.id })
      let fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds).toContain(b.id)

      const unblockResult = await unblockUser({ id: a.id }, { targetUserId: b.id.toUpperCase() })
      expect(unblockResult.ok).toBe(true)
      fresh = await User.findById(a.id).lean()
      expect(fresh?.blockedUserIds).not.toContain(b.id)
    })

    it('refuse de bloquer un compte inexistant (user_not_found)', async () => {
      const a = await seedUser()
      const result = await blockUser({ id: a.id }, { targetUserId: fakeObjectId() })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('user_not_found')
    })
  })

  describe('reportUser', () => {
    it('signale un compte (chemin heureux), avec des noms résolus depuis de vrais documents User', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })

      const result = await reportUser({ id: a.id }, { targetUserId: b.id, reason: 'Comportement inapproprié' })
      expect(result.ok).toBe(true)

      const report = await Report.findOne({ fromId: a.id, targetId: b.id }).lean()
      expect(report).toBeTruthy()
      expect(report?.fromName).toBe('Alice A')
      expect(report?.targetName).toBe('Bob B')
      expect(report?.reason).toBe('Comportement inapproprié')
    })

    it('refuse de se signaler soi-même (cannot_report_self)', async () => {
      const a = await seedUser()
      const result = await reportUser({ id: a.id }, { targetUserId: a.id, reason: 'x' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_report_self')
    })

    it('refuse de se signaler soi-même même avec son propre id soumis dans une casse différente', async () => {
      const a = await seedUser()
      const result = await reportUser({ id: a.id }, { targetUserId: a.id.toUpperCase(), reason: 'x' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_report_self')

      const reportCount = await Report.countDocuments({ fromId: a.id })
      expect(reportCount).toBe(0)
    })

    it('refuse un motif vide (reason_required)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await reportUser({ id: a.id }, { targetUserId: b.id, reason: '   ' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('reason_required')
    })

    it('refuse un motif de plus de 1000 caractères (reason_required)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await reportUser({ id: a.id }, { targetUserId: b.id, reason: 'x'.repeat(1001) })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('reason_required')
    })

    it('refuse un compte cible inexistant (user_not_found)', async () => {
      const a = await seedUser()
      const result = await reportUser({ id: a.id }, { targetUserId: fakeObjectId(), reason: 'x' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('user_not_found')
    })
  })
})
