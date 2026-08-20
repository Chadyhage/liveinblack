// Tests d'intégration (vraie base MongoDB) pour les actions de message et de
// conversation ajoutées en #50 (fidélité legacy MessagingPage.jsx) :
// édition, suppression (moi/tous), marquage important, transfert, épingle/
// masquage/sourdine PERSONNELS de conversation, indicateur de frappe.
import { describe, it, expect } from 'vitest'
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
import { createPoll, voteOnPoll } from '../polls'
import { createGroup, muteMember } from '../groups'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import User from '../../models/User'
import Report from '../../models/Report'
import { RUN_INTEGRATION, seedUser, setupMongoIntegrationSuite } from './integrationTestHelpers'

const describeIntegration = describe.skipIf(!RUN_INTEGRATION)

setupMongoIntegrationSuite([Conversation, Message, User, Report])

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

    it('pagine les messages importants avec métadonnées page/total/hasMore cohérentes', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')

      const messageIds: string[] = []
      for (let i = 0; i < 12; i++) {
        const sent = await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: `msg-${i}` })
        expect(sent.ok).toBe(true)
        if (!sent.ok) return
        messageIds.push(sent.message.id)
      }

      for (const id of messageIds) {
        const star = await starMessage({ id: b.id }, { messageId: id })
        expect(star.ok).toBe(true)
      }

      const page1 = await listStarredMessages({ id: b.id }, { page: 1, pageSize: 10 })
      expect(page1.ok).toBe(true)
      if (!page1.ok) return
      expect(page1.total).toBe(12)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(10)
      expect(page1.hasMore).toBe(true)
      expect(page1.messages).toHaveLength(10)

      const page2 = await listStarredMessages({ id: b.id }, { page: 2, pageSize: 10 })
      expect(page2.ok).toBe(true)
      if (!page2.ok) return
      expect(page2.total).toBe(12)
      expect(page2.page).toBe(2)
      expect(page2.pageSize).toBe(10)
      expect(page2.hasMore).toBe(false)
      expect(page2.messages).toHaveLength(2)
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

    it('transfère un sondage en réinitialisant les votes de la conversation source', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const c = await seedUser({ firstName: 'Charly', lastName: 'C' })
      const convAB = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      const convAC = await createDirectConversation({ id: a.id }, { otherUserId: c.id })
      if (!convAB.ok || !convAC.ok) throw new Error('setup failed')

      const created = await createPoll({ id: a.id }, { conversationId: convAB.conversation.id, question: 'On commande quoi ?', options: ['Pizza', 'Burger'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      const voteA = await voteOnPoll({ id: a.id }, { messageId: created.message.id, optionId: '0' })
      expect(voteA.ok).toBe(true)
      const voteB = await voteOnPoll({ id: b.id }, { messageId: created.message.id, optionId: '1' })
      expect(voteB.ok).toBe(true)

      const fwd = await forwardMessage({ id: a.id }, { messageId: created.message.id, toConversationIds: [convAC.conversation.id] })
      expect(fwd.ok).toBe(true)
      if (!fwd.ok) return
      expect(fwd.messages).toHaveLength(1)
      expect(fwd.messages[0].type).toBe('poll')
      expect(fwd.messages[0].content).toBeNull()
      expect(fwd.messages[0].poll?.question).toBe('On commande quoi ?')
      expect(fwd.messages[0].poll?.options).toEqual([
        { id: '0', text: 'Pizza', voterIds: [] },
        { id: '1', text: 'Burger', voterIds: [] },
      ])

      const sourceMessages = await getMessages({ id: a.id }, { conversationId: convAB.conversation.id })
      expect(sourceMessages.ok).toBe(true)
      if (!sourceMessages.ok) return
      expect(sourceMessages.messages).toHaveLength(1)
      expect(sourceMessages.messages[0].poll?.options).toEqual([
        { id: '0', text: 'Pizza', voterIds: [a.id] },
        { id: '1', text: 'Burger', voterIds: [b.id] },
      ])

      const targetMessages = await getMessages({ id: a.id }, { conversationId: convAC.conversation.id })
      expect(targetMessages.ok).toBe(true)
      if (!targetMessages.ok) return
      expect(targetMessages.messages).toHaveLength(1)
      expect(targetMessages.messages[0].poll?.options).toEqual([
        { id: '0', text: 'Pizza', voterIds: [] },
        { id: '1', text: 'Burger', voterIds: [] },
      ])
      expect(targetMessages.messages[0].forwardedFrom?.senderName).toBe('Alice A')
      expect(targetMessages.messages[0].forwardedFrom?.convName).toBe('Bob B')
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

    it("une conversation masquée reste masquée même si l'autre participant envoie un nouveau message", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')

      const hide = await hideConversationForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(hide.ok).toBe(true)

      const sent = await sendMessage({ id: b.id }, { conversationId: conv.conversation.id, type: 'text', content: 'nouveau message' })
      expect(sent.ok).toBe(true)

      const listA = await listMyConversations({ id: a.id })
      expect(listA.ok).toBe(true)
      if (!listA.ok) return
      expect(listA.conversations).toHaveLength(0)

      const listB = await listMyConversations({ id: b.id })
      expect(listB.ok).toBe(true)
      if (!listB.ok) return
      expect(listB.conversations).toHaveLength(1)
      expect(listB.conversations[0].lastMessage).toBe('nouveau message')

      const messagesA = await getMessages({ id: a.id }, { conversationId: conv.conversation.id })
      expect(messagesA.ok).toBe(true)
      if (!messagesA.ok) return
      expect(messagesA.messages).toHaveLength(1)
      expect(messagesA.messages[0].content).toBe('nouveau message')
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

    it("vider l'historique ne masque PAS les nouveaux messages reçus ensuite", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await createDirectConversation({ id: a.id }, { otherUserId: b.id })
      if (!conv.ok) throw new Error('setup failed')
      await sendMessage({ id: a.id }, { conversationId: conv.conversation.id, type: 'text', content: 'ancien a' })
      await sendMessage({ id: b.id }, { conversationId: conv.conversation.id, type: 'text', content: 'ancien b' })

      const cleared = await clearHistoryForMe({ id: a.id }, { conversationId: conv.conversation.id })
      expect(cleared.ok).toBe(true)

      const afterClear = await getMessages({ id: a.id }, { conversationId: conv.conversation.id })
      expect(afterClear.ok).toBe(true)
      if (!afterClear.ok) return
      expect(afterClear.messages).toEqual([])

      const fresh = await sendMessage({ id: b.id }, { conversationId: conv.conversation.id, type: 'text', content: 'nouveau après nettoyage' })
      expect(fresh.ok).toBe(true)

      const aMessages = await getMessages({ id: a.id }, { conversationId: conv.conversation.id })
      expect(aMessages.ok).toBe(true)
      if (!aMessages.ok) return
      expect(aMessages.messages).toHaveLength(1)
      expect(aMessages.messages[0].content).toBe('nouveau après nettoyage')

      const bMessages = await getMessages({ id: b.id }, { conversationId: conv.conversation.id })
      expect(bMessages.ok).toBe(true)
      if (!bMessages.ok) return
      expect(bMessages.messages.map((message) => message.content)).toEqual(['ancien a', 'ancien b', 'nouveau après nettoyage'])
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
