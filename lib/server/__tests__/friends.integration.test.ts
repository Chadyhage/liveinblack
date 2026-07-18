// Tests d'INTÉGRATION (vraie base MongoDB) pour le cycle demande d'ami →
// amitié (#43) : send/accept/decline/cancel/remove/list. Couvre en
// particulier :
//  - l'ordre normalisé (plus petit id d'abord) du document Friendship créé ;
//  - la garde-fou atomique contre la demande double dans le même sens
//    (index unique partiel FriendRequest {fromId,toId,status:'pending'}) ;
//  - l'auto-acceptation d'une demande mutuelle (X→Y puis Y→X) ;
//  - la course concurrente sur un accept (une seule Friendship créée) ;
//  - le 404 générique pour cancel (expéditeur uniquement, jamais un tiers) ;
//  - removeFriend, quel que soit l'ordre de stockage de la paire.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listFriends,
  listMyFriendRequests,
} from '../friends'
import User from '../../models/User'
import FriendRequest from '../../models/FriendRequest'
import Friendship from '../../models/Friendship'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

// `blockedUserIds` est en cours d'ajout à User.ts par un autre chantier
// (cf. lib/server/friends.ts) — on adapte au moment de l'exécution plutôt
// que de figer une hypothèse à l'écriture de ce fichier : si le champ
// n'existe toujours pas, ce test précis est sauté proprement plutôt que de
// faire échouer toute la suite pour un champ qui peut légitimement ne pas
// exister encore.
const HAS_BLOCK_LIST = Boolean(User.schema.path('blockedUserIds'))

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
  // FriendRequest est un modèle NEUF : son index unique partiel se construit
  // en arrière-plan après le premier accès (autoIndex) — sans ce `.init()`,
  // le test de double demande concurrente peut s'exécuter avant que l'index
  // n'existe et passer à tort (même piège que seatAssignment.integration.test.ts).
  await FriendRequest.init()
  await Friendship.init()
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Promise.all([User.deleteMany({}), FriendRequest.deleteMany({}), Friendship.deleteMany({})])
})

// Les id doivent être de vrais ObjectId Mongo (comme en prod, où ils viennent
// toujours de session.user.id = String(user._id)) — un CastError guette
// sinon sur User.findById avec une chaîne arbitraire non-ObjectId.
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

describeIntegration('friends (intégration, vraie base) — demandes + amitiés (#43)', () => {
  describe('sendFriendRequest → acceptFriendRequest', () => {
    it('crée une demande en attente puis une Friendship normalisée (plus petit id en premier) à l’acceptation', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return
      expect(sent.status).toBe('pending')
      expect(sent.requestId).toBeTruthy()

      const request = await FriendRequest.findById(sent.requestId).lean()
      expect(request?.status).toBe('pending')
      expect(request?.fromId).toBe(x.id)
      expect(request?.toId).toBe(y.id)

      const accepted = await acceptFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(accepted.ok).toBe(true)

      const [expectedA, expectedB] = [x.id, y.id].sort()
      const friendship = await Friendship.findOne({}).lean()
      expect(friendship).not.toBeNull()
      expect(friendship?.userAId).toBe(expectedA)
      expect(friendship?.userBId).toBe(expectedB)

      const resolvedRequest = await FriendRequest.findById(sent.requestId).lean()
      expect(resolvedRequest?.status).toBe('accepted')
      expect(resolvedRequest?.respondedAt).toBeTruthy()
    })
  })

  describe('declineFriendRequest', () => {
    it('passe la demande à declined sans jamais créer de Friendship', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return

      const declined = await declineFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(declined.ok).toBe(true)

      const request = await FriendRequest.findById(sent.requestId).lean()
      expect(request?.status).toBe('declined')

      const friendshipCount = await Friendship.countDocuments({})
      expect(friendshipCount).toBe(0)
    })
  })

  describe('cancelFriendRequest', () => {
    it("l'expéditeur original annule sa propre demande ; un tiers qui essaie reçoit un 404 générique", async () => {
      const x = await seedUser()
      const y = await seedUser()
      const outsider = await seedUser()

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return

      // Le destinataire n'est PAS l'expéditeur : il doit passer par decline,
      // pas par cancel — 404 générique, pas 403 (ne confirme rien).
      const byRecipient = await cancelFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(byRecipient.ok).toBe(false)
      if (byRecipient.ok) return
      expect(byRecipient.status).toBe(404)
      expect(byRecipient.error).toBe('request_not_found')

      const byOutsider = await cancelFriendRequest({ id: outsider.id }, { requestId: sent.requestId as string })
      expect(byOutsider.ok).toBe(false)
      if (byOutsider.ok) return
      expect(byOutsider.status).toBe(404)
      expect(byOutsider.error).toBe('request_not_found')

      const cancelled = await cancelFriendRequest({ id: x.id }, { requestId: sent.requestId as string })
      expect(cancelled.ok).toBe(true)

      const request = await FriendRequest.findById(sent.requestId).lean()
      expect(request?.status).toBe('cancelled')
    })
  })

  describe('demande double dans le même sens', () => {
    it('deux envois concurrents X→Y : un seul réussit (409 request_already_pending)', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const [first, second] = await Promise.all([
        sendFriendRequest({ id: x.id }, { toUserId: y.id }),
        sendFriendRequest({ id: x.id }, { toUserId: y.id }),
      ])

      const results = [first, second]
      const oks = results.filter((r) => r.ok)
      const fails = results.filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const failure = fails[0]
      if (failure.ok) throw new Error('unreachable')
      expect(failure.status).toBe(409)
      expect(failure.error).toBe('request_already_pending')

      const pendingCount = await FriendRequest.countDocuments({ fromId: x.id, toId: y.id, status: 'pending' })
      expect(pendingCount).toBe(1)
    })
  })

  describe('demande mutuelle (auto-acceptation)', () => {
    it("Y envoie à X pendant que la demande de X vers Y est encore en attente : la seconde demande retourne 'friends', et il ne reste aucune demande en attente dans un sens ou l'autre", async () => {
      const x = await seedUser()
      const y = await seedUser()

      const xToY = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(xToY.ok).toBe(true)
      if (!xToY.ok) return
      expect(xToY.status).toBe('pending')

      const yToX = await sendFriendRequest({ id: y.id }, { toUserId: x.id })
      expect(yToX.ok).toBe(true)
      if (!yToX.ok) return
      expect(yToX.status).toBe('friends')

      const [expectedA, expectedB] = [x.id, y.id].sort()
      const friendship = await Friendship.findOne({}).lean()
      expect(friendship).not.toBeNull()
      expect(friendship?.userAId).toBe(expectedA)
      expect(friendship?.userBId).toBe(expectedB)

      const pendingCount = await FriendRequest.countDocuments({ status: 'pending' })
      expect(pendingCount).toBe(0)

      const originalRequest = await FriendRequest.findById(xToY.requestId).lean()
      expect(originalRequest?.status).toBe('accepted')
    })
  })

  describe('sendFriendRequest — course perdue contre un accept direct sur la demande inverse', () => {
    it("ne crée pas de demande fantôme quand la vérification initiale 'already_friends' s'exécute avant qu'un accept concurrent ne crée la Friendship", async () => {
      const x = await seedUser()
      const y = await seedUser()

      // X → Y en attente.
      const xToY = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(xToY.ok).toBe(true)
      if (!xToY.ok) return

      // Y accepte DIRECTEMENT cette demande en premier (gagne la course) :
      // la Friendship existe déjà et la demande X→Y n'est plus 'pending'.
      const accepted = await acceptFriendRequest({ id: y.id }, { requestId: xToY.requestId as string })
      expect(accepted.ok).toBe(true)
      expect(await Friendship.countDocuments({})).toBe(1)

      // On simule la fenêtre de course décrite par l'audit : la vérification
      // `alreadyFriends` de sendFriendRequest (friends.ts:156) s'est exécutée
      // AVANT que l'accept concurrent ci-dessus n'ait posé la Friendship (elle
      // a donc vu `false`) — on force un seul faux-négatif sur ce premier
      // appel. `tryMutualAutoAccept` retombe ensuite naturellement à `null`
      // car la demande inverse n'est déjà plus 'pending'. Sans la
      // revérification ajoutée après `tryMutualAutoAccept`, ce chemin créerait
      // une demande Y→X fantôme alors que X et Y sont déjà amis.
      const existsSpy = vi.spyOn(Friendship, 'exists').mockImplementationOnce(() => Promise.resolve(null) as unknown as ReturnType<typeof Friendship.exists>)
      try {
        const yToX = await sendFriendRequest({ id: y.id }, { toUserId: x.id })
        expect(yToX.ok).toBe(false)
        if (yToX.ok) return
        expect(yToX.status).toBe(400)
        expect(yToX.error).toBe('already_friends')
      } finally {
        existsSpy.mockRestore()
      }

      // Aucune demande fantôme en attente dans un sens ou l'autre, une seule
      // Friendship.
      expect(await FriendRequest.countDocuments({ status: 'pending' })).toBe(0)
      expect(await Friendship.countDocuments({})).toBe(1)
    })
  })

  describe('acceptFriendRequest — déjà résolue / course concurrente', () => {
    it('refuse d’accepter une demande déjà déclinée (409 request_not_pending)', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return

      const declined = await declineFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(declined.ok).toBe(true)

      const accept = await acceptFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(accept.ok).toBe(false)
      if (accept.ok) return
      expect(accept.status).toBe(409)
      expect(accept.error).toBe('request_not_pending')
    })

    it('deux accept concurrents sur la même demande : un seul réussit, une seule Friendship créée', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return

      const [first, second] = await Promise.all([
        acceptFriendRequest({ id: y.id }, { requestId: sent.requestId as string }),
        acceptFriendRequest({ id: y.id }, { requestId: sent.requestId as string }),
      ])

      const results = [first, second]
      const oks = results.filter((r) => r.ok)
      const fails = results.filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const failure = fails[0]
      if (failure.ok) throw new Error('unreachable')
      expect(failure.status).toBe(409)
      expect(failure.error).toBe('request_not_pending')

      const friendshipCount = await Friendship.countDocuments({})
      expect(friendshipCount).toBe(1)
    })
  })

  describe('removeFriend', () => {
    it('supprime la Friendship quel que soit l’ordre normalisé de stockage, et renvoie 400 not_friends si aucune amitié n’existe', async () => {
      const x = await seedUser()
      const y = await seedUser()

      const noFriendship = await removeFriend({ id: x.id }, { friendUserId: y.id })
      expect(noFriendship.ok).toBe(false)
      if (noFriendship.ok) return
      expect(noFriendship.status).toBe(400)
      expect(noFriendship.error).toBe('not_friends')

      const sent = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sent.ok).toBe(true)
      if (!sent.ok) return
      const accepted = await acceptFriendRequest({ id: y.id }, { requestId: sent.requestId as string })
      expect(accepted.ok).toBe(true)

      expect(await Friendship.countDocuments({})).toBe(1)

      // Retrait déclenché par l'autre côté de la paire (Y), pas X — vérifie
      // que la normalisation est bien exploitée dans les deux sens.
      const removed = await removeFriend({ id: y.id }, { friendUserId: x.id })
      expect(removed.ok).toBe(true)
      expect(await Friendship.countDocuments({})).toBe(0)
    })
  })

  describe('sendFriendRequest — validations', () => {
    it('refuse de s’auto-ajouter (cannot_friend_self)', async () => {
      const x = await seedUser()
      const result = await sendFriendRequest({ id: x.id }, { toUserId: x.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_friend_self')
    })

    it('refuse une cible inexistante (user_not_found)', async () => {
      const x = await seedUser()
      const fakeId = new mongoose.Types.ObjectId().toString()
      const result = await sendFriendRequest({ id: x.id }, { toUserId: fakeId })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('user_not_found')
    })

    it.runIf(HAS_BLOCK_LIST)('refuse une demande entre deux comptes où l’un a bloqué l’autre (403 blocked)', async () => {
      const x = await seedUser()
      const y = await seedUser({ blockedUserIds: [] })
      await User.findByIdAndUpdate(y.id, { $set: { blockedUserIds: [x.id] } })

      const result = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('blocked')
    })
  })

  describe('listFriends / listMyFriendRequests', () => {
    it('liste les amis et les demandes en attente (reçues/envoyées) avec les noms résolus', async () => {
      const x = await seedUser({ firstName: 'Xavier', lastName: 'Un' })
      const y = await seedUser({ firstName: 'Yvonne', lastName: 'Deux' })
      const z = await seedUser({ firstName: 'Zoe', lastName: 'Trois' })

      const sentToY = await sendFriendRequest({ id: x.id }, { toUserId: y.id })
      expect(sentToY.ok).toBe(true)
      if (!sentToY.ok) return
      const accepted = await acceptFriendRequest({ id: y.id }, { requestId: sentToY.requestId as string })
      expect(accepted.ok).toBe(true)

      const sentToZ = await sendFriendRequest({ id: x.id }, { toUserId: z.id })
      expect(sentToZ.ok).toBe(true)

      const friends = await listFriends({ id: x.id })
      expect(friends.ok).toBe(true)
      if (!friends.ok) return
      expect(friends.friends).toHaveLength(1)
      expect(friends.friends[0].userId).toBe(y.id)
      expect(friends.friends[0].name).toBe('Yvonne Deux')

      const requestsForX = await listMyFriendRequests({ id: x.id })
      expect(requestsForX.ok).toBe(true)
      if (!requestsForX.ok) return
      expect(requestsForX.received).toHaveLength(0)
      expect(requestsForX.sent).toHaveLength(1)
      expect(requestsForX.sent[0].toId).toBe(z.id)
      expect(requestsForX.sent[0].toName).toBe('Zoe Trois')

      const requestsForZ = await listMyFriendRequests({ id: z.id })
      expect(requestsForZ.ok).toBe(true)
      if (!requestsForZ.ok) return
      expect(requestsForZ.received).toHaveLength(1)
      expect(requestsForZ.received[0].fromId).toBe(x.id)
      expect(requestsForZ.received[0].fromName).toBe('Xavier Un')
      expect(requestsForZ.sent).toHaveLength(0)
    })
  })
})
