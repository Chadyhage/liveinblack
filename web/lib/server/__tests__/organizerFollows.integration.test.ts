// Tests d'INTÉGRATION (vraie base MongoDB, transactions réelles) pour
// l'abonnement (follow) ASYMÉTRIQUE d'un utilisateur à un profil PUBLIC
// d'organisateur (#44) — voir l'en-tête de lib/server/organizerFollows.ts.
// Couvre en particulier :
//  - le maintien de OrganizerProfile.followersCount en phase avec le nombre
//    réel de documents OrganizerFollow (jamais de dérive, y compris sous
//    course concurrente — check-then-act protégé par l'index unique
//    {userId,organizerId} + catch de duplicate key DANS la transaction) ;
//  - l'idempotence de follow/unfollow (alreadyFollowing / wasFollowing) ;
//  - la fusion partielle des préférences d'alerte (updateFollowAlerts) ;
//  - la validation 400 (corps vide) faite au niveau ROUTE, pas seulement lib.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { followOrganizer, unfollowOrganizer, updateFollowAlerts, listMyFollowedOrganizers, isFollowing } from '../organizerFollows'
import OrganizerFollow from '../../models/OrganizerFollow'
import OrganizerProfile from '../../models/OrganizerProfile'
import User from '../../models/User'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

// `auth()` mocké pour pouvoir exercer le VRAI handler de route (validation
// zod du corps incluse) sans dépendre d'un cookie de session NextAuth réel —
// le reste de la suite teste lib/server/organizerFollows.ts directement,
// mais "rejette un corps vide côté route" ne peut être vérifié qu'en
// appelant le handler lui-même.
let mockCallerId: string | null = null
vi.mock('@/auth', () => ({
  auth: async () => (mockCallerId ? { user: { id: mockCallerId } } : null),
}))

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
  mockCallerId = null
  await Promise.all([OrganizerFollow.deleteMany({}), OrganizerProfile.deleteMany({}), User.deleteMany({})])
})

// userId/organizerId doivent être de vrais ObjectId Mongo (comme en prod, où
// ils viennent toujours de session.user.id = String(user._id)) — Mongoose
// lève un CastError sur des lookups par _id avec une chaîne arbitraire non-
// ObjectId ; on sème donc systématiquement de vrais documents User.
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

async function seedOrganizerProfile(userId: string, overrides: Record<string, unknown> = {}) {
  return OrganizerProfile.create({
    userId,
    publicName: 'Test Organizer',
    slug: `test-organizer-${Math.random().toString(36).slice(2)}`,
    status: 'public',
    ...overrides,
  })
}

describeIntegration('organizerFollows (intégration, transaction réelle) — abonnement organisateur (#44)', () => {
  describe('followOrganizer', () => {
    it('crée le follow avec les alerts par défaut du schéma et incrémente followersCount de exactement 1', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()

      const result = await followOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.alreadyFollowing).toBe(false)

      const follow = await OrganizerFollow.findOne({ userId: follower.id, organizerId: profile.userId }).lean()
      expect(follow).not.toBeNull()
      expect(follow?.alerts?.newEvent).toBe(true)
      expect(follow?.alerts?.cancelled).toBe(true)
      expect(follow?.alerts?.almostFull).toBe(true)
      expect(follow?.alerts?.newMedia).toBe(false)

      // Lecture FRAÎCHE (pas la valeur en mémoire) : c'est bien le document
      // en base qui doit refléter l'incrément.
      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(1)
    })

    it('suivre deux fois le même organisateur : le second appel est un no-op (alreadyFollowing:true), sans double incrément', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()

      const first = await followOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.alreadyFollowing).toBe(false)

      const second = await followOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.alreadyFollowing).toBe(true)

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(1)

      const count = await OrganizerFollow.countDocuments({ userId: follower.id, organizerId: profile.userId })
      expect(count).toBe(1)
    })

    it('deux followOrganizer CONCURRENTS sur la même paire (user, organizer) : followersCount incrémenté une seule fois, un seul document OrganizerFollow', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()

      const [first, second] = await Promise.all([
        followOrganizer({ id: follower.id }, { organizerId: profile.userId }),
        followOrganizer({ id: follower.id }, { organizerId: profile.userId }),
      ])

      // Les deux appels réussissent (l'un crée, l'autre voit un duplicate
      // key et retombe proprement sur alreadyFollowing:true) — jamais
      // d'erreur exposée à l'appelant pour une simple course de idempotence.
      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) return
      const alreadyFollowingFlags = [first.alreadyFollowing, second.alreadyFollowing].sort()
      expect(alreadyFollowingFlags).toEqual([false, true])

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(1)

      const count = await OrganizerFollow.countDocuments({ userId: follower.id, organizerId: profile.userId })
      expect(count).toBe(1)
    })

    it('refuse de suivre son propre profil organisateur (400 cannot_follow_self)', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)

      const result = await followOrganizer({ id: organizerUser.id }, { organizerId: profile.userId })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_follow_self')

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(0)
    })

    it('refuse de suivre un organizerId inexistant (404 organizer_not_found)', async () => {
      const follower = await seedUser()

      const result = await followOrganizer({ id: follower.id }, { organizerId: new mongoose.Types.ObjectId().toString() })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('organizer_not_found')
    })

    it.each(['draft', 'hidden', 'suspended', 'pending_review'] as const)(
      "refuse de suivre un profil status:'%s' — même 404 organizer_not_found qu'un profil inexistant, sans créer de follow ni incrémenter le compteur",
      async (status) => {
        const organizerUser = await seedUser()
        const profile = await seedOrganizerProfile(organizerUser.id, { status })
        const follower = await seedUser()

        const result = await followOrganizer({ id: follower.id }, { organizerId: profile.userId })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.status).toBe(404)
        expect(result.error).toBe('organizer_not_found')

        const follow = await OrganizerFollow.findOne({ userId: follower.id, organizerId: profile.userId }).lean()
        expect(follow).toBeNull()

        const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
        expect(freshProfile?.followersCount).toBe(0)
      }
    )
  })

  describe('unfollowOrganizer', () => {
    it('supprime le document OrganizerFollow et décrémente followersCount de exactement 1', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()

      const followed = await followOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(followed.ok).toBe(true)

      const result = await unfollowOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.wasFollowing).toBe(true)

      const follow = await OrganizerFollow.findOne({ userId: follower.id, organizerId: profile.userId }).lean()
      expect(follow).toBeNull()

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(0)
    })

    it("ne rien décrémenter quand aucun follow n'existe (no-op, wasFollowing:false)", async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id, { followersCount: 5 })
      const follower = await seedUser()

      const result = await unfollowOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.wasFollowing).toBe(false)

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(5)
    })

    it('le compteur ne passe jamais sous 0 même en cas de dérive hypothétique (déjà à 0, un follow orphelin est supprimé)', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id, { followersCount: 0 })
      const follower = await seedUser()
      // Follow créé directement (hors du chemin normal followOrganizer) pour
      // simuler une dérive où le compteur était déjà à 0.
      await OrganizerFollow.create({ userId: follower.id, organizerId: profile.userId })

      const result = await unfollowOrganizer({ id: follower.id }, { organizerId: profile.userId })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.wasFollowing).toBe(true)

      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(0)
    })
  })

  describe('updateFollowAlerts', () => {
    it('la mise à jour partielle ne change que les clés fournies, laisse les autres inchangées', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()
      await followOrganizer({ id: follower.id }, { organizerId: profile.userId })

      const first = await updateFollowAlerts({ id: follower.id }, { organizerId: profile.userId, alerts: { newMedia: true } })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.alerts.newMedia).toBe(true)
      expect(first.alerts.newEvent).toBe(true)
      expect(first.alerts.cancelled).toBe(true)
      expect(first.alerts.almostFull).toBe(true)

      const second = await updateFollowAlerts(
        { id: follower.id },
        { organizerId: profile.userId, alerts: { newEvent: false, almostFull: false } }
      )
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.alerts.newEvent).toBe(false)
      expect(second.alerts.almostFull).toBe(false)
      // Inchangés depuis le premier appel partiel.
      expect(second.alerts.cancelled).toBe(true)
      expect(second.alerts.newMedia).toBe(true)

      const persisted = await OrganizerFollow.findOne({ userId: follower.id, organizerId: profile.userId }).lean()
      expect(persisted?.alerts?.newEvent).toBe(false)
      expect(persisted?.alerts?.almostFull).toBe(false)
      expect(persisted?.alerts?.cancelled).toBe(true)
      expect(persisted?.alerts?.newMedia).toBe(true)
    })

    it("rejette si l'appelant ne suit pas cet organisateur (404 not_following)", async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const notFollower = await seedUser()

      const result = await updateFollowAlerts({ id: notFollower.id }, { organizerId: profile.userId, alerts: { newEvent: false } })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('not_following')
    })
  })

  describe('POST /api/organizers/[organizerId]/follow/alerts — validation au niveau route', () => {
    it('rejette un corps vide (400) avant même d’atteindre updateFollowAlerts', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()
      await followOrganizer({ id: follower.id }, { organizerId: profile.userId })

      mockCallerId = follower.id
      const { POST } = await import('../../../app/api/organizers/[organizerId]/follow/alerts/route')

      const req = new Request('http://localhost/api/organizers/x/follow/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const res = await POST(req, { params: Promise.resolve({ organizerId: profile.userId }) })
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('invalid_body')

      // Le corps vide n'a rien dû modifier.
      const persisted = await OrganizerFollow.findOne({ userId: follower.id, organizerId: profile.userId }).lean()
      expect(persisted?.alerts?.newEvent).toBe(true)
    })

    it('401 quand non authentifié', async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)

      mockCallerId = null
      const { POST } = await import('../../../app/api/organizers/[organizerId]/follow/alerts/route')

      const req = new Request('http://localhost/api/organizers/x/follow/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newEvent: false }),
      })
      const res = await POST(req, { params: Promise.resolve({ organizerId: profile.userId }) })
      expect(res.status).toBe(401)
    })
  })

  describe('listMyFollowedOrganizers', () => {
    it("retourne les données jointes (nom, slug) pour plusieurs follows, et n'inclut pas ceux d'un autre utilisateur", async () => {
      const organizerUserA = await seedUser()
      const profileA = await seedOrganizerProfile(organizerUserA.id, { publicName: 'Organizer A' })
      const organizerUserB = await seedUser()
      const profileB = await seedOrganizerProfile(organizerUserB.id, { publicName: 'Organizer B' })

      const follower = await seedUser()
      const otherUser = await seedUser()

      await followOrganizer({ id: follower.id }, { organizerId: profileA.userId })
      await followOrganizer({ id: follower.id }, { organizerId: profileB.userId })
      await followOrganizer({ id: otherUser.id }, { organizerId: profileA.userId })

      const result = await listMyFollowedOrganizers({ id: follower.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.follows).toHaveLength(2)

      const byOrganizerId = new Map(result.follows.map((f) => [f.organizerId, f]))
      expect(byOrganizerId.get(profileA.userId)?.organizerName).toBe('Organizer A')
      expect(byOrganizerId.get(profileA.userId)?.organizerSlug).toBe(profileA.slug)
      expect(byOrganizerId.get(profileB.userId)?.organizerName).toBe('Organizer B')
      expect(byOrganizerId.get(profileB.userId)?.organizerSlug).toBe(profileB.slug)

      // L'autre utilisateur ne voit que SON propre abonnement.
      const otherResult = await listMyFollowedOrganizers({ id: otherUser.id })
      expect(otherResult.ok).toBe(true)
      if (!otherResult.ok) return
      expect(otherResult.follows).toHaveLength(1)
      expect(otherResult.follows[0].organizerId).toBe(profileA.userId)
    })

    it("renvoie une liste vide si l'appelant ne suit personne", async () => {
      const follower = await seedUser()
      const result = await listMyFollowedOrganizers({ id: follower.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.follows).toEqual([])
    })
  })

  describe('isFollowing', () => {
    it("reflète l'état réel avant/après follow, sans effet de bord", async () => {
      const organizerUser = await seedUser()
      const profile = await seedOrganizerProfile(organizerUser.id)
      const follower = await seedUser()

      const before = await isFollowing({ id: follower.id }, { organizerId: profile.userId })
      expect(before.following).toBe(false)

      await followOrganizer({ id: follower.id }, { organizerId: profile.userId })

      const after = await isFollowing({ id: follower.id }, { organizerId: profile.userId })
      expect(after.following).toBe(true)

      // Vérifie l'absence d'effet de bord : toujours pas de changement du
      // compteur au-delà de l'unique follow ci-dessus.
      const freshProfile = await OrganizerProfile.findOne({ userId: profile.userId }).lean()
      expect(freshProfile?.followersCount).toBe(1)
    })
  })
})
