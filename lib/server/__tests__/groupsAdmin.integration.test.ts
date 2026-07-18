// Tests d'intégration (vraie base MongoDB) pour la gestion de groupe ajoutée
// en #50 : ajout/retrait de membre, promotion/rétrogradation d'admin,
// renommage, épingle de message — fidélité à MessagingPage.jsx
// (handleAddMember/handleRemoveMember/handleSetAdmin/handleRenameGroup),
// capacité que ce fichier prétendait à tort absente du legacy.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createGroup, addMember, removeMember, setMemberRole, renameGroup, pinMessage, unpinMessage } from '../groups'
import { sendMessage } from '../messaging'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import User from '../../models/User'

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
  await Promise.all([Conversation.deleteMany({}), Message.deleteMany({}), User.deleteMany({})])
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

describeIntegration('groups admin (intégration, vraie base) — #50', () => {
  describe('addMember', () => {
    it("l'admin ajoute un nouveau membre, un message système l'annonce", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser()
      const c = await seedUser({ firstName: 'Chris', lastName: 'C' })
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await addMember({ id: a.id }, { conversationId: created.conversation.id, userId: c.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.conversation.participantIds.sort()).toEqual([a.id, b.id, c.id].sort())
      expect(result.conversation.members.find((m) => m.userId === c.id)?.name).toBe('Chris C')

      const sys = await Message.find({ conversationId: created.conversation.id, type: 'system' }).sort({ createdAt: -1 }).lean()
      expect(sys[0].content).toContain('Chris C')
    })

    it('un membre non-admin ne peut pas ajouter (admin_only)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await addMember({ id: b.id }, { conversationId: created.conversation.id, userId: c.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('admin_only')
    })

    it('refuse un membre déjà présent (already_a_member)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await addMember({ id: a.id }, { conversationId: created.conversation.id, userId: b.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('already_a_member')
    })
  })

  describe('removeMember', () => {
    it("l'admin retire un membre, qui ne peut plus écrire ensuite (conversation_not_found)", async () => {
      const a = await seedUser()
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await removeMember({ id: a.id }, { conversationId: created.conversation.id, userId: b.id })
      expect(result.ok).toBe(true)

      const fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.participantIds).toEqual([a.id])

      const blocked = await sendMessage({ id: b.id }, { conversationId: created.conversation.id, type: 'text', content: 'coucou' })
      expect(blocked.ok).toBe(false)
      if (blocked.ok) return
      expect(blocked.status).toBe(404)
    })

    it('refuse de se retirer soi-même via cette route (cannot_remove_self)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await removeMember({ id: a.id }, { conversationId: created.conversation.id, userId: a.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('cannot_remove_self')
    })
  })

  describe('setMemberRole', () => {
    it('promeut un membre en admin, puis peut le rétrograder', async () => {
      const a = await seedUser()
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const promote = await setMemberRole({ id: a.id }, { conversationId: created.conversation.id, userId: b.id, role: 'admin' })
      expect(promote.ok).toBe(true)
      let fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.members?.find((m) => m.userId === b.id)?.role).toBe('admin')

      const demote = await setMemberRole({ id: b.id }, { conversationId: created.conversation.id, userId: a.id, role: 'member' })
      expect(demote.ok).toBe(true)
      fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.members?.find((m) => m.userId === a.id)?.role).toBe('member')
    })

    it('refuse de rétrograder le DERNIER admin (only_admin)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await setMemberRole({ id: a.id }, { conversationId: created.conversation.id, userId: a.id, role: 'member' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('only_admin')
    })
  })

  describe('renameGroup', () => {
    it('renomme un groupe et poste un message système', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Ancien nom', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')

      const result = await renameGroup({ id: a.id }, { conversationId: created.conversation.id, name: 'Nouveau nom' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.name).toBe('Nouveau nom')

      const fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.name).toBe('Nouveau nom')
      const sys = await Message.find({ conversationId: created.conversation.id, type: 'system' }).sort({ createdAt: -1 }).lean()
      expect(sys[0].content).toContain('Nouveau nom')
    })
  })

  describe('pinMessage / unpinMessage', () => {
    it("l'admin épingle un message du groupe, puis le désépingle", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: b.id }, { conversationId: created.conversation.id, type: 'text', content: 'à épingler' })
      if (!sent.ok) throw new Error('setup failed')

      const pinned = await pinMessage({ id: a.id }, { conversationId: created.conversation.id, messageId: sent.message.id })
      expect(pinned.ok).toBe(true)
      let fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.pinnedMessageId).toBe(sent.message.id)
      let msg = await Message.findById(sent.message.id).lean()
      expect(msg?.pinned).toBe(true)

      const unpinned = await unpinMessage({ id: a.id }, { conversationId: created.conversation.id })
      expect(unpinned.ok).toBe(true)
      fresh = await Conversation.findById(created.conversation.id).lean()
      expect(fresh?.pinnedMessageId).toBeNull()
      msg = await Message.findById(sent.message.id).lean()
      expect(msg?.pinned).toBe(false)
    })

    it('un non-admin ne peut pas épingler (admin_only)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const created = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id] })
      if (!created.ok) throw new Error('setup failed')
      const sent = await sendMessage({ id: b.id }, { conversationId: created.conversation.id, type: 'text', content: 'x' })
      if (!sent.ok) throw new Error('setup failed')

      const result = await pinMessage({ id: b.id }, { conversationId: created.conversation.id, messageId: sent.message.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('admin_only')
    })
  })
})
