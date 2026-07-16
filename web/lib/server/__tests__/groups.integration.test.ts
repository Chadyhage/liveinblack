// Tests d'INTÉGRATION (vraie base MongoDB) pour le cycle de vie des groupes
// (création, départ, suppression, sourdine de membre) — voir lib/server/groups.ts
// pour le détail de chaque garde et de la sémantique de suppression
// transactionnelle (conversation + messages, jamais l'un sans l'autre).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createGroup, leaveGroup, deleteGroup, muteMember, unmuteMember } from '../groups'
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

// Toujours de VRAIS documents User Mongoose avec un VRAI ObjectId `.id` —
// jamais une chaîne arbitraire (`User.findById` lève un CastError sur une
// chaîne non-ObjectId, bug déjà rencontré plusieurs fois dans cette migration).
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

// Seed direct d'une conversation de groupe (contourne createGroup) : utile
// pour préparer des états que createGroup ne produit jamais lui-même (deux
// admins, membres pré-mutés...), exactement comme messaging.integration.test.ts
// le fait déjà pour ses propres scénarios de groupe.
async function seedGroup(members: { userId: string; name: string; role: 'admin' | 'member' }[], overrides: Record<string, unknown> = {}) {
  return Conversation.create({
    type: 'group',
    participantIds: members.map((m) => m.userId),
    members,
    name: 'Groupe test',
    mutedUserIds: [],
    ...overrides,
  })
}

describeIntegration('groups (intégration, vraie base) — cycle de vie des groupes (#41)', () => {
  describe('createGroup', () => {
    it("crée un groupe : l'appelant devient seul admin, les autres deviennent membres, un message système annonce la création", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const c = await seedUser({ firstName: 'Chris', lastName: 'C' })

      const result = await createGroup({ id: a.id }, { name: 'Sortie de vendredi', memberUserIds: [b.id, c.id] })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.conversation.type).toBe('group')
      expect(result.conversation.name).toBe('Sortie de vendredi')
      expect(result.conversation.participantIds.sort()).toEqual([a.id, b.id, c.id].sort())
      const byId = new Map(result.conversation.members.map((m) => [m.userId, m] as const))
      expect(byId.get(a.id)?.role).toBe('admin')
      expect(byId.get(a.id)?.name).toBe('Alice A')
      expect(byId.get(b.id)?.role).toBe('member')
      expect(byId.get(b.id)?.name).toBe('Bob B')
      expect(byId.get(c.id)?.role).toBe('member')

      const systemMessages = await Message.find({ conversationId: result.conversation.id, type: 'system' }).lean()
      expect(systemMessages).toHaveLength(1)
      expect(systemMessages[0].senderId).toBe(a.id)
      expect(systemMessages[0].senderName).toBe('Alice A')
      expect(systemMessages[0].content).toContain('Alice A')

      const fresh = await Conversation.findById(result.conversation.id).lean()
      expect(fresh?.lastSenderId).toBe(a.id)
      expect(fresh?.lastMessageAt).toBeTruthy()
    })

    it('refuse un nom vide (group_name_required)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await createGroup({ id: a.id }, { name: '   ', memberUserIds: [b.id] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('group_name_required')
    })

    it('refuse un nom de plus de 100 caractères (group_name_too_long)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await createGroup({ id: a.id }, { name: 'x'.repeat(101), memberUserIds: [b.id] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('group_name_too_long')
    })

    it("refuse un groupe sans autre membre (not_enough_members) — un 'groupe' de soi-même n'a pas de sens", async () => {
      const a = await seedUser()
      const result = await createGroup({ id: a.id }, { name: 'Solo', memberUserIds: [] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('not_enough_members')
    })

    it('refuse un membre inexistant (user_not_found)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [b.id, fakeObjectId()] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('user_not_found')

      // Aucune conversation ne doit avoir été créée sur un échec de validation.
      const count = await Conversation.countDocuments({})
      expect(count).toBe(0)
    })

    it("retire silencieusement l'id de l'appelant s'il figure dans memberUserIds, sans jamais erreur", async () => {
      const a = await seedUser()
      const b = await seedUser()

      const result = await createGroup({ id: a.id }, { name: 'Groupe', memberUserIds: [a.id, b.id] })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.conversation.participantIds.sort()).toEqual([a.id, b.id].sort())
      expect(result.conversation.members).toHaveLength(2)
    })

    it("un groupe créé avec exactement 1 autre membre (borne basse) réussit", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const result = await createGroup({ id: a.id }, { name: 'Duo', memberUserIds: [b.id] })
      expect(result.ok).toBe(true)
    })
  })

  describe('leaveGroup', () => {
    it('un membre régulier quitte : le groupe survit, il est retiré de participantIds ET members, un message système le trace', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const c = await seedUser({ firstName: 'Chris', lastName: 'C' })
      const conv = await seedGroup([
        { userId: a.id, name: 'Alice A', role: 'admin' },
        { userId: b.id, name: 'Bob B', role: 'member' },
        { userId: c.id, name: 'Chris C', role: 'member' },
      ])

      const result = await leaveGroup({ id: b.id }, { conversationId: conv.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.deleted).toBe(false)

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh).toBeTruthy()
      expect(fresh?.participantIds.sort()).toEqual([a.id, c.id].sort())
      expect(fresh?.members?.map((m) => m.userId).sort()).toEqual([a.id, c.id].sort())
      // Personne n'a été promu : l'admin d'origine (a) est toujours seul admin.
      expect(fresh?.members?.find((m) => m.userId === a.id)?.role).toBe('admin')
      expect(fresh?.members?.find((m) => m.userId === c.id)?.role).toBe('member')

      const systemMessages = await Message.find({ conversationId: conv.id, type: 'system' }).lean()
      expect(systemMessages).toHaveLength(1)
      expect(systemMessages[0].content).toContain('Bob B')
    })

    it("l'admin UNIQUE qui quitte : le premier membre restant est auto-promu admin", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const c = await seedUser({ firstName: 'Chris', lastName: 'C' })
      const conv = await seedGroup([
        { userId: a.id, name: 'Alice A', role: 'admin' },
        { userId: b.id, name: 'Bob B', role: 'member' },
        { userId: c.id, name: 'Chris C', role: 'member' },
      ])

      const result = await leaveGroup({ id: a.id }, { conversationId: conv.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.deleted).toBe(false)

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.members?.map((m) => m.userId).sort()).toEqual([b.id, c.id].sort())
      // b est le premier membre restant (ordre d'origine du tableau) : c'est
      // LUI qui doit être promu, jamais c.
      expect(fresh?.members?.find((m) => m.userId === b.id)?.role).toBe('admin')
      expect(fresh?.members?.find((m) => m.userId === c.id)?.role).toBe('member')
    })

    it('le DERNIER membre restant qui quitte : le groupe ET tous ses messages sont supprimés', async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const conv = await seedGroup([
        { userId: a.id, name: 'Alice A', role: 'admin' },
        { userId: b.id, name: 'Bob B', role: 'member' },
      ])
      for (let i = 0; i < 3; i++) {
        await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'Alice A', type: 'text', content: `msg ${i}` })
      }

      // a quitte d'abord : le groupe survit, b devient seul admin (auto-promotion).
      const first = await leaveGroup({ id: a.id }, { conversationId: conv.id })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.deleted).toBe(false)
      const midway = await Conversation.findById(conv.id).lean()
      expect(midway?.members?.map((m) => m.userId)).toEqual([b.id])
      expect(midway?.members?.[0]?.role).toBe('admin')

      // b quitte à son tour : plus personne — le groupe ET tous ses messages
      // (y compris ceux seedés AVANT, pas seulement les messages système)
      // disparaissent.
      const second = await leaveGroup({ id: b.id }, { conversationId: conv.id })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.deleted).toBe(true)

      const deletedConv = await Conversation.findById(conv.id).lean()
      expect(deletedConv).toBeNull()
      const remainingMessages = await Message.find({ conversationId: conv.id }).lean()
      expect(remainingMessages).toHaveLength(0)
    })

    it("refuse un appelant non-membre (conversation_not_found)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])

      const result = await leaveGroup({ id: outsider.id }, { conversationId: conv.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })

    it("refuse sur une conversation DIRECTE, avec EXACTEMENT le même 404 générique", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await Conversation.create({ type: 'direct', participantIds: [a.id, b.id] })

      const result = await leaveGroup({ id: a.id }, { conversationId: conv.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })
  })

  describe('deleteGroup', () => {
    it('un admin peut supprimer le groupe : la conversation ET ses messages disparaissent', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])
      await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'A', type: 'text', content: 'salut' })

      const result = await deleteGroup({ id: a.id }, { conversationId: conv.id })
      expect(result.ok).toBe(true)

      expect(await Conversation.findById(conv.id).lean()).toBeNull()
      expect(await Message.find({ conversationId: conv.id }).lean()).toHaveLength(0)
    })

    it('un membre non-admin est refusé (403 admin_only)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])

      const result = await deleteGroup({ id: b.id }, { conversationId: conv.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('admin_only')

      // Le groupe n'a pas été touché.
      expect(await Conversation.findById(conv.id).lean()).toBeTruthy()
    })

    it('un non-membre est refusé (404 conversation_not_found)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])

      const result = await deleteGroup({ id: outsider.id }, { conversationId: conv.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })
  })

  describe('muteMember / unmuteMember', () => {
    it('un admin peut mettre en sourdine puis lever la sourdine d’un membre régulier (idempotent)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])

      const muted = await muteMember({ id: a.id }, { conversationId: conv.id, targetUserId: b.id })
      expect(muted.ok).toBe(true)
      let fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([b.id])

      // Idempotent : une seconde mise en sourdine ne duplique pas l'entrée.
      const mutedAgain = await muteMember({ id: a.id }, { conversationId: conv.id, targetUserId: b.id })
      expect(mutedAgain.ok).toBe(true)
      fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([b.id])

      const unmuted = await unmuteMember({ id: a.id }, { conversationId: conv.id, targetUserId: b.id })
      expect(unmuted.ok).toBe(true)
      fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([])

      // Idempotent dans l'autre sens : lever une sourdine déjà levée est un no-op.
      const unmutedAgain = await unmuteMember({ id: a.id }, { conversationId: conv.id, targetUserId: b.id })
      expect(unmutedAgain.ok).toBe(true)
      fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([])
    })

    it('un membre non-admin qui tente de mettre en sourdine est refusé (403 admin_only)', async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
        { userId: c.id, name: 'C', role: 'member' },
      ])

      const result = await muteMember({ id: b.id }, { conversationId: conv.id, targetUserId: c.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('admin_only')

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([])
    })

    it("mettre en sourdine un AUTRE admin est refusé (400 target_is_admin), quel que soit l'admin qui l'attempte", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const c = await seedUser()
      // Deux admins (a, b) — état que createGroup ne produit jamais seul,
      // mais que la modération doit gérer correctement si un groupe finit
      // avec plusieurs admins (auto-promotion successive, par exemple).
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'admin' },
        { userId: c.id, name: 'C', role: 'member' },
      ])

      const aTriesB = await muteMember({ id: a.id }, { conversationId: conv.id, targetUserId: b.id })
      expect(aTriesB.ok).toBe(false)
      if (aTriesB.ok) return
      expect(aTriesB.status).toBe(400)
      expect(aTriesB.error).toBe('target_is_admin')

      // Sens inverse : b (admin) qui tente sur a (admin) — même refus, la
      // règle ne dépend pas de QUEL admin est à l'origine de la tentative.
      const bTriesA = await muteMember({ id: b.id }, { conversationId: conv.id, targetUserId: a.id })
      expect(bTriesA.ok).toBe(false)
      if (bTriesA.ok) return
      expect(bTriesA.status).toBe(400)
      expect(bTriesA.error).toBe('target_is_admin')

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh?.mutedUserIds).toEqual([])
    })

    it("mettre en sourdine un non-membre du groupe est refusé (400 not_a_member)", async () => {
      const a = await seedUser()
      const b = await seedUser()
      const outsider = await seedUser()
      const conv = await seedGroup([
        { userId: a.id, name: 'A', role: 'admin' },
        { userId: b.id, name: 'B', role: 'member' },
      ])

      const result = await muteMember({ id: a.id }, { conversationId: conv.id, targetUserId: outsider.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('not_a_member')
    })
  })

  describe('concurrence', () => {
    it("deux membres qui quittent EN MÊME TEMPS (groupe de 3) convergent vers le MÊME état final quel que soit l'ordre : seul le membre restant survit, promu admin", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const c = await seedUser({ firstName: 'Chris', lastName: 'C' })
      const conv = await seedGroup([
        { userId: a.id, name: 'Alice A', role: 'admin' },
        { userId: b.id, name: 'Bob B', role: 'member' },
        { userId: c.id, name: 'Chris C', role: 'member' },
      ])

      // a (admin) ET b (membre) quittent en même temps : quel que soit
      // l'ordre de commit des deux transactions, l'auto-promotion en cascade
      // (voir lib/server/groups.ts:leaveGroup) fait toujours converger vers
      // le MÊME état final — seul c doit rester, promu admin.
      const [first, second] = await Promise.all([
        leaveGroup({ id: a.id }, { conversationId: conv.id }),
        leaveGroup({ id: b.id }, { conversationId: conv.id }),
      ])

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) return
      // Le groupe ne devient jamais vide dans ce scénario (c reste) : aucun
      // des deux appels ne doit rapporter une suppression.
      expect(first.deleted).toBe(false)
      expect(second.deleted).toBe(false)

      const fresh = await Conversation.findById(conv.id).lean()
      expect(fresh).toBeTruthy()
      expect(fresh?.participantIds).toEqual([c.id])
      expect(fresh?.members).toHaveLength(1)
      expect(fresh?.members?.[0]?.userId).toBe(c.id)
      expect(fresh?.members?.[0]?.role).toBe('admin')
    })

    it("deux membres qui quittent EN MÊME TEMPS un groupe de 2 : pas de crash de double-suppression, le groupe et TOUS ses messages finissent supprimés", async () => {
      const a = await seedUser({ firstName: 'Alice', lastName: 'A' })
      const b = await seedUser({ firstName: 'Bob', lastName: 'B' })
      const conv = await seedGroup([
        { userId: a.id, name: 'Alice A', role: 'admin' },
        { userId: b.id, name: 'Bob B', role: 'member' },
      ])
      for (let i = 0; i < 3; i++) {
        await Message.create({ conversationId: conv.id, senderId: a.id, senderName: 'Alice A', type: 'text', content: `msg ${i}` })
      }

      const [first, second] = await Promise.all([
        leaveGroup({ id: a.id }, { conversationId: conv.id }),
        leaveGroup({ id: b.id }, { conversationId: conv.id }),
      ])

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) return

      // Exactement UN des deux appels a vidé (et donc supprimé) le groupe —
      // jamais aucun (état incohérent), jamais les deux (double-suppression).
      const deletedFlags = [first.deleted, second.deleted]
      expect(deletedFlags.filter(Boolean)).toHaveLength(1)
      expect(deletedFlags.filter((d) => !d)).toHaveLength(1)

      const deletedConv = await Conversation.findById(conv.id).lean()
      expect(deletedConv).toBeNull()
      // AUCUN message orphelin — ni les 3 seedés au départ, ni les messages
      // système créés par les deux départs eux-mêmes.
      const remainingMessages = await Message.find({ conversationId: conv.id }).lean()
      expect(remainingMessages).toHaveLength(0)
    })
  })
})
