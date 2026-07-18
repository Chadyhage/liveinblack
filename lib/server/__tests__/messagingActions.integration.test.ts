// Tests d'intégration (vraie base MongoDB) pour les actions de message et de
// conversation ajoutées en #50 (fidélité legacy MessagingPage.jsx) :
// édition, suppression (moi/tous), marquage important, transfert, épingle/
// masquage/sourdine PERSONNELS de conversation, indicateur de frappe.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import {
  createDirectConversation,
  sendMessage,
  editMessage,
  deleteMessageForMe,
  deleteMessageForAll,
  starMessage,
  unstarMessage,
  listStarredMessages,
  forwardMessage,
  pinConversationForMe,
  unpinConversationForMe,
  muteConversationForMe,
  unmuteConversationForMe,
  hideConversationForMe,
  clearHistoryForMe,
  setTyping,
  getTypingUsers,
  listMyConversations,
  getMessages,
} from '../messaging'
import { createGroup, muteMember } from '../groups'
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

describeIntegration('messaging actions (intégration, vraie base) — #50', () => {
  describe('editMessage', () => {
    it('le propriétaire modifie son propre message texte — editedAt renseigné', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Coucou' })
      if (!sent.ok) throw new Error('setup failed')

      const edited = await editMessage({ id: a.id }, { messageId: sent.message.id, content: 'Coucou modifié' })
      expect(edited.ok).toBe(true)
      if (!edited.ok) return
      expect(edited.message.content).toBe('Coucou modifié')
      expect(edited.message.editedAt).toBeTruthy()
    })

    it("refuse l'édition par un autre participant (not_message_owner)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Coucou' })
      if (!sent.ok) throw new Error('setup failed')

      const edited = await editMessage({ id: b.id }, { messageId: sent.message.id, content: 'Piraté' })
      expect(edited.ok).toBe(false)
      if (edited.ok) return
      expect(edited.status).toBe(403)
      expect(edited.error).toBe('not_message_owner')
    })

    it("refuse d'éditer un message image (invalid_type)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'image', content: 'https://example.com/x.jpg' })
      if (!sent.ok) throw new Error('setup failed')

      const edited = await editMessage({ id: a.id }, { messageId: sent.message.id, content: 'nope' })
      expect(edited.ok).toBe(false)
      if (edited.ok) return
      expect(edited.error).toBe('invalid_type')
    })
  })

  describe('deleteMessageForMe / deleteMessageForAll', () => {
    it('supprimer pour moi masque le message UNIQUEMENT pour moi (getMessages)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Coucou' })
      if (!sent.ok) throw new Error('setup failed')

      const del = await deleteMessageForMe({ id: a.id }, { messageId: sent.message.id })
      expect(del.ok).toBe(true)

      const aMessages = await getMessages({ id: a.id }, { conversationId: conv.conversation.id })
      expect(aMessages.ok && aMessages.messages).toEqual([])

      const bMessages = await getMessages({ id: b.id }, { conversationId: conv.conversation.id })
      expect(bMessages.ok && bMessages.messages.length).toBe(1)
    })

    it('supprimer pour tous remplace le contenu pour TOUS les participants', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Coucou' })
      if (!sent.ok) throw new Error('setup failed')

      const del = await deleteMessageForAll({ id: a.id }, { messageId: sent.message.id })
      expect(del.ok).toBe(true)

      const bMessages = await getMessages({ id: b.id }, { conversationId: conv.conversation.id })
      expect(bMessages.ok).toBe(true)
      if (!bMessages.ok) return
      expect(bMessages.messages[0].deletedForAll).toBe(true)
      expect(bMessages.messages[0].content).toBeNull()
    })

    it("refuse 'supprimer pour tous' à un non-propriétaire", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Coucou' })
      if (!sent.ok) throw new Error('setup failed')

      const del = await deleteMessageForAll({ id: b.id }, { messageId: sent.message.id })
      expect(del.ok).toBe(false)
      if (del.ok) return
      expect(del.error).toBe('not_message_owner')
    })
  })

  describe('star / listStarredMessages', () => {
    it('marque un message important puis le retrouve dans la liste transversale', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'Important !' })
      if (!sent.ok) throw new Error('setup failed')

      const starred = await starMessage({ id: b.id }, { messageId: sent.message.id })
      expect(starred.ok && starred.starred).toBe(true)

      // Marqué uniquement pour B — pas pour A.
      const listB = await listStarredMessages({ id: b.id })
      expect(listB.ok && listB.messages).toHaveLength(1)
      const listA = await listStarredMessages({ id: a.id })
      expect(listA.ok && listA.messages).toHaveLength(0)

      const unstarred = await unstarMessage({ id: b.id }, { messageId: sent.message.id })
      expect(unstarred.ok && unstarred.starred).toBe(false)
      const listBAfter = await listStarredMessages({ id: b.id })
      expect(listBAfter.ok && listBAfter.messages).toHaveLength(0)
    })
  })

  describe('forwardMessage', () => {
    it('transfère vers une autre conversation avec le libellé "Transféré de"', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser()
      const c = await seedUser()
      const convAB = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      const convAC = await createDirectConversation({ id: a.id }, { otherUserId: c.id })
      if (!convAB.ok || !convAC.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: convAB.conversation.id, type: 'text', content: 'Salut' })
      if (!sent.ok) throw new Error('setup failed')

      const fwd = await forwardMessage({ id: a.id }, { messageId: sent.message.id, toConversationIds: [convAC.conversation.id] })
      expect(fwd.ok).toBe(true)
      if (!fwd.ok) return
      expect(fwd.messages).toHaveLength(1)
      expect(fwd.messages[0].content).toBe('Salut')
      expect(fwd.messages[0].forwardedFrom?.senderName).toBe('Alice A')
    })

    it("ignore silencieusement une conversation cible où l'appelant n'est pas participant", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const convAB = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      const convBC = await createDirectConversation({ id: b.id }, { otherUserId: c.id })
      if (!convAB.ok || !convBC.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: a.id }, { conversationId: convAB.conversation.id, type: 'text', content: 'Salut' })
      if (!sent.ok) throw new Error('setup failed')

      const fwd = await forwardMessage({ id: a.id }, { messageId: sent.message.id, toConversationIds: [convBC.conversation.id] })
      expect(fwd.ok).toBe(false)
      if (fwd.ok) return
      expect(fwd.error).toBe('forward_failed')
    })
  })

  describe('pin / mute / hide de conversation (personnels)', () => {
    it('épingler trie la conversation en tête de liste, indépendamment de lastMessageAt', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const convAB = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      const convAC = await createDirectConversation({ id: a.id }, { otherUserId: c.id })
      if (!convAB.ok || !convAC.ok) throw new Error('setup failed')
      // AC a un message plus récent que AB.
      await sendMessage({ id: a.id }, { conversationId: convAC.conversation.id, type: 'text', content: 'plus récent' })

      const pin = await pinConversationForMe({ id: a.id }, { conversationId: convAB.conversation.id })
      expect(pin.ok).toBe(true)

      const list = await listMyConversations({ id: a.id })
      expect(list.ok).toBe(true)
      if (!list.ok) return
      expect(list.conversations[0].id).toBe(convAB.conversation.id)
      expect(list.conversations[0].pinned).toBe(true)

      const unpin = await unpinConversationForMe({ id: a.id }, { conversationId: convAB.conversation.id })
      expect(unpin.ok).toBe(true)
      const listAfter = await listMyConversations({ id: a.id })
      expect(listAfter.ok && listAfter.conversations[0].id).toBe(convAC.conversation.id)
    })

    it('masquer une conversation la retire de la liste — sans affecter l\'autre participant', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')

      const hide = await hideConversationForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(hide.ok).toBe(true)

      const listA = await listMyConversations({ id: a.id })
      expect(listA.ok && listA.conversations).toHaveLength(0)
      const listB = await listMyConversations({ id: b.id })
      expect(listB.ok && listB.conversations).toHaveLength(1)
    })

    it('couper les notifications marque mutedForMe SANS affecter la sourdine de groupe (envoi toujours possible)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')

      const mute = await muteConversationForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(mute.ok).toBe(true)
      const list = await listMyConversations({ id: a.id })
      expect(list.ok && list.conversations[0].mutedForMe).toBe(true)

      const stillCanSend = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'toujours possible' })
      expect(stillCanSend.ok).toBe(true)

      const unmute = await unmuteConversationForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(unmute.ok).toBe(true)
      const listAfter = await listMyConversations({ id: a.id })
      expect(listAfter.ok && listAfter.conversations[0].mutedForMe).toBe(false)
    })

    it("vider l'historique masque tous les messages existants pour l'appelant seul", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'un' })
      await sendMessage({ id: b.id }, { conversationId: conv.conversation.id, type: 'text', content: 'deux' })

      const cleared = await clearHistoryForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(cleared.ok).toBe(true)

      const aMessages = await getMessages({ id: a.id }, { conversationId: conv.conversation.id })
      expect(aMessages.ok && aMessages.messages).toHaveLength(0)
      const bMessages = await getMessages({ id: b.id }, { conversationId: conv.conversation.id })
      expect(bMessages.ok && bMessages.messages).toHaveLength(2)
    })
  })

  describe('typing indicator', () => {
    it("signale la frappe et l'expose à l'AUTRE participant, jamais à soi-même", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')

      const set = await setTyping({ id: a.id }, { conversationId: conv.conversation.id, typing: true })
      expect(set.ok).toBe(true)

      const seenByB = await getTypingUsers({ id: b.id }, { conversationId: conv.conversation.id })
      expect(seenByB.ok).toBe(true)
      if (!seenByB.ok) return
      expect(seenByB.users).toEqual([{ userId: a.id, name: 'Alice A' }])

      const seenByA = await getTypingUsers({ id: a.id }, { conversationId: conv.conversation.id })
      expect(seenByA.ok && seenByA.users).toEqual([])

      await setTyping({ id: a.id }, { conversationId: conv.conversation.id, typing: false })
      const seenByBAfter = await getTypingUsers({ id: b.id }, { conversationId: conv.conversation.id })
      expect(seenByBAfter.ok && seenByBAfter.users).toEqual([])
    })
  })

  describe('sourdine de groupe temporisée (memberMuteUntil)', () => {
    it('un membre muté avec une durée expirée peut de nouveau écrire', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const muted = await muteMember({ id: a.id }, { conversationId: created.conversation.id, targetUserId: b.id, durationMs: 300 })
      expect(muted.ok).toBe(true)

      // Immédiatement après : encore muté.
      const blocked = await sendMessage({ id: b.id }, { conversationId: created.conversation.id, type: 'text', content: 'coucou' })
      expect(blocked.ok).toBe(false)

      await new Promise((resolve) => setTimeout(resolve, 400))

      // Après expiration : plus muté (lazy-expire, jamais de job de fond).
      const allowed = await sendMessage({ id: b.id }, { conversationId: created.conversation.id, type: 'text', content: 'coucou' })
      expect(allowed.ok).toBe(true)
    })
  })
})
