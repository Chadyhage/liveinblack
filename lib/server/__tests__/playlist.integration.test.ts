// Tests d'INTÉGRATION (vraie base MongoDB, transactions réelles) pour la
// playlist crowd-sourcée + modération DJ (port de PlaylistSystem.jsx +
// PlaylistDJPanel.jsx, ferme l'audit H16). Couvre en particulier :
//  - le gating de participation d'addSong (billet + check-in réels) ;
//  - le quota (1 son/billet) et son ANTI-RACE transactionnel ;
//  - la règle d'autorisation canModeratePlaylist (owner/agent/roster
//    dj|manager UNIQUEMENT — pas serveur/scan, contrairement à
//    l'échelle de rang de la commande sur place) ;
//  - le budget de 5 likes/événement et son remboursement à la refus ;
//  - getPlaylist (vue publique + contexte personnel exact).
//
// searchSongs fait un VRAI appel réseau vers itunes.apple.com — cf. section
// dédiée en fin de fichier : si l'environnement n'a pas d'accès réseau, ce
// SEUL test est sauté (describe.skipIf dédié), le reste de la suite tourne
// normalement.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import {
  canModeratePlaylist,
  hasEventParticipation,
  addSong,
  addSongAsDj,
  toggleLike,
  setSongStatus,
  removeSong,
  removeOwnSong,
  playNow,
  stopNow,
  getPlaylist,
  searchSongs,
} from '../playlist'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
import User from '../../models/User'
import EventStaff from '../../models/EventStaff'
import EventPlaylist from '../../models/EventPlaylist'

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
  await Promise.all([
    Event.deleteMany({}),
    Ticket.deleteMany({}),
    User.deleteMany({}),
    EventStaff.deleteMany({}),
    EventPlaylist.deleteMany({}),
  ])
})

// Toujours de VRAIS documents Mongoose avec de vrais ObjectId .id — un id de
// caller factice ferait planter resolveCallerName (User.findById) avec un
// CastError, pas juste échouer l'assertion (piège déjà rencontré ailleurs
// dans cette migration, cf. eventOrders.integration.test.ts).
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

async function seedEvent(ownerId: string, overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Test Event',
    date: '2099-01-01',
    time: '22:00',
    endTime: '05:00',
    currency: 'EUR',
    createdBy: ownerId,
    organizerId: ownerId,
    places: [{ id: 'std', type: 'Standard', price: 2000, available: 10, total: 10, included: [] }],
    ...overrides,
  })
}

async function seedTicket(eventId: string, userId: string, overrides: Record<string, unknown> = {}) {
  return Ticket.create({
    ticketCode: `TICK${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    eventId,
    eventName: 'Test Event',
    eventDate: '1 janvier 2099',
    place: 'Standard',
    placePrice: 2000,
    totalPrice: 2000,
    currency: 'EUR',
    paid: true,
    userId,
    preorders: [],
    ...overrides,
  })
}

async function seedCheckedInTicket(eventId: string, userId: string, overrides: Record<string, unknown> = {}) {
  return seedTicket(eventId, userId, { checkedInAt: new Date(), checkedInBy: userId, ...overrides })
}

async function addStaff(eventId: string, uid: string, role: 'scan' | 'serveur' | 'manager' | 'dj') {
  await EventStaff.findOneAndUpdate(
    { eventId },
    { $set: { [`roster.${uid}`]: { role, name: '', addedBy: 'test-setup', addedAt: new Date() } } },
    { upsert: true }
  )
}

describeIntegration('playlist (intégration, transaction réelle)', () => {
  // ─────────────────────────────── addSong ───────────────────────────────

  describe('addSong', () => {
    it("chemin heureux : un titulaire de billet SCANNÉ ajoute un son, statut 'pending'", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)

      const result = await addSong(
        { id: holder.id, roles: ['client'] },
        { eventId: event.id, title: 'Titre Test', artist: 'Artiste Test', previewUrl: 'https://x/preview.m4a', cover: 'https://x/cover.jpg' }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.song.title).toBe('Titre Test')
      expect(result.song.addedBy).toBe(holder.id)
      expect(result.song.status).toBe('pending')
      expect(result.song.likedBy).toEqual([])
      expect(result.song.addedByName).toContain('Prenom')
    })

    it('refusé (403 not_checked_in) pour un utilisateur SANS AUCUN billet pour cet événement', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const stranger = await seedUser()

      const result = await addSong({ id: stranger.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('not_checked_in')
    })

    it('refusé (403 not_checked_in) pour un titulaire de billet PAS ENCORE scanné', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedTicket(event.id, holder.id) // pas de checkedInAt

      const result = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('not_checked_in')
    })

    it('refusé (403 quota_exceeded) une fois le quota (= nombre de billets) épuisé', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id) // 1 seul billet → 1 son max

      const first = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Premier son' })
      expect(first.ok).toBe(true)

      const second = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Deuxième son' })
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.status).toBe(403)
      expect(second.error).toBe('quota_exceeded')
    })

    it('refusé (400 duplicate_song) pour un titre déjà présent, comparaison insensible à la casse', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)
      await seedCheckedInTicket(event.id, holder.id) // 2 billets → 2 slots, pour isoler le duplicate du quota

      const first = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Blinding Lights' })
      expect(first.ok).toBe(true)

      const dup = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'blinding lights' })
      expect(dup.ok).toBe(false)
      if (dup.ok) return
      expect(dup.status).toBe(400)
      expect(dup.error).toBe('duplicate_song')
    })

    it('CONCURRENCE : avec exactement 1 place restante, deux addSong simultanés → un seul succès, un seul document créé', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id) // 1 seul billet → 1 slot

      const [first, second] = await Promise.all([
        addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son A' }),
        addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son B' }),
      ])

      const results = [first, second]
      const successes = results.filter((r) => r.ok)
      const failures = results.filter((r) => !r.ok)
      expect(successes).toHaveLength(1)
      expect(failures).toHaveLength(1)
      const failure = failures[0]
      if (failure.ok) return
      expect(failure.status).toBe(403)
      expect(failure.error).toBe('quota_exceeded')

      const playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.songs).toHaveLength(1)
    })

    it("CONCURRENCE : le quota re-vérifie le nombre de billets DANS la transaction, pas depuis la valeur figée avant son ouverture (billet révoqué en plein vol)", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      const ticket = await seedCheckedInTicket(event.id, holder.id) // 1 seul billet → 1 slot

      // Simule un remboursement/révocation CONCURRENT : il survient juste
      // après le pre-check hors transaction (ticketCount=1 capturé par
      // hasEventParticipation), mais avant que la transaction interne
      // d'addSong ne fasse sa toute première opération transactionnelle
      // (getOrCreatePlaylist → EventPlaylist.findOneAndUpdate). Si le quota
      // réutilisait le `ticketCount` figé avant la transaction (bug), l'ajout
      // réussirait quand même avec 0 billet valide restant. Avec le fix
      // (recomptage `Ticket.countDocuments(...).session(session)` DANS la
      // transaction), l'ajout doit être rejeté.
      const originalFindOneAndUpdate = EventPlaylist.findOneAndUpdate.bind(EventPlaylist)
      const spy = vi.spyOn(EventPlaylist, 'findOneAndUpdate').mockImplementation((async (...args: unknown[]) => {
        await Ticket.updateOne({ _id: ticket._id }, { $set: { revoked: true } })
        spy.mockRestore()
        return (originalFindOneAndUpdate as (...a: unknown[]) => unknown)(...args)
      }) as unknown as typeof EventPlaylist.findOneAndUpdate)

      try {
        const result = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.status).toBe(403)
        expect(result.error).toBe('quota_exceeded')
      } finally {
        spy.mockRestore()
      }

      const playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.songs ?? []).toHaveLength(0)
    })

    it("refusé (403 not_checked_in) : un billet CHECKED-IN mais pour un AUTRE événement ne doit pas compter (scoping par eventId)", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const otherOwner = await seedUser()
      const otherEvent = await seedEvent(otherOwner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(otherEvent.id, holder.id) // billet réel, mais pour otherEvent, pas event

      const participation = await hasEventParticipation(holder.id, event.id)
      expect(participation.ticketCount).toBe(0)
      expect(participation.hasCheckedIn).toBe(false)

      const result = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('not_checked_in')
    })
  })

  // ────────────────────────────── addSongAsDj ─────────────────────────────

  describe('addSongAsDj', () => {
    it("chemin heureux pour un roster 'dj' : ajout auto-validé", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const djUser = await seedUser()
      await addStaff(event.id, djUser.id, 'dj')

      const result = await addSongAsDj({ id: djUser.id, roles: ['client'] }, { eventId: event.id, title: 'Son DJ' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.song.status).toBe('validated')
      expect(result.song.addedBy).toBe(djUser.id)
    })

    it("chemin heureux pour le PROPRIÉTAIRE de l'événement (sans entrée roster)", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)

      const result = await addSongAsDj({ id: owner.id, roles: ['client'] }, { eventId: event.id, title: 'Son Owner' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.song.status).toBe('validated')
    })

    it("refusé (403 staff_only) pour un roster 'serveur'", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const serveurUser = await seedUser()
      await addStaff(event.id, serveurUser.id, 'serveur')

      const result = await addSongAsDj({ id: serveurUser.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('staff_only')
    })

    it("refusé (403 staff_only) pour un roster 'scan'", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const scanUser = await seedUser()
      await addStaff(event.id, scanUser.id, 'scan')

      const result = await addSongAsDj({ id: scanUser.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('staff_only')
    })

    it("refusé (403 staff_only) pour un utilisateur authentifié SANS AUCUNE relation avec l'événement", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const rando = await seedUser()

      const result = await addSongAsDj({ id: rando.id, roles: ['client'] }, { eventId: event.id, title: 'Son' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('staff_only')
    })
  })

  // ─────────────────────────────── toggleLike ─────────────────────────────

  describe('toggleLike', () => {
    it('chemin heureux : like puis unlike, bascule correctement', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const author = await seedUser()
      await seedCheckedInTicket(event.id, author.id)
      const added = await addSong({ id: author.id, roles: ['client'] }, { eventId: event.id, title: 'Son A' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const liker = await seedUser()

      const liked = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(liked.ok).toBe(true)
      if (liked.ok) expect(liked.liked).toBe(true)

      let playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.songs.find((s) => s.id === added.song.id)?.likedBy).toContain(liker.id)

      const unliked = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(unliked.ok).toBe(true)
      if (unliked.ok) expect(unliked.liked).toBe(false)

      playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.songs.find((s) => s.id === added.song.id)?.likedBy).not.toContain(liker.id)
    })

    it('refusé (400 cannot_like_own_song) de liker son propre son', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const author = await seedUser()
      await seedCheckedInTicket(event.id, author.id)
      const added = await addSong({ id: author.id, roles: ['client'] }, { eventId: event.id, title: 'Son A' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const result = await toggleLike({ id: author.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('cannot_like_own_song')
    })

    it('refusé (403 like_quota_exceeded) après 5 likes (budget total sur TOUT l’événement, pas par chanson) ; refuser les 5 sons likés rembourse intégralement le budget (5 likes de plus possibles ensuite)', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const author = await seedUser()
      // 12 billets scannés → 12 sons possibles : 5 pour la première salve de
      // likes, 1 pour prouver le rejet au-delà de 5, 5 AUTRES pour prouver
      // que le remboursement est bien TOTAL une fois les 5 premiers refusés,
      // 1 dernier pour reprouver que le budget (de nouveau) plein rejette un
      // 6e like.
      for (let i = 0; i < 12; i++) await seedCheckedInTicket(event.id, author.id)

      const songIds: string[] = []
      for (let i = 0; i < 12; i++) {
        const added = await addSong({ id: author.id, roles: ['client'] }, { eventId: event.id, title: `Son ${i}` })
        expect(added.ok).toBe(true)
        if (added.ok) songIds.push(added.song.id)
      }

      const liker = await seedUser()

      // Like les 5 premiers → budget épuisé (vérifié sur 5 chansons DIFFÉRENTES,
      // le budget est bien par événement entier, pas par chanson).
      for (let i = 0; i < 5; i++) {
        const r = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: songIds[i] })
        expect(r.ok).toBe(true)
      }

      const sixth = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: songIds[5] })
      expect(sixth.ok).toBe(false)
      if (!sixth.ok) {
        expect(sixth.status).toBe(403)
        expect(sixth.error).toBe('like_quota_exceeded')
      }

      // Le DJ (propriétaire) refuse les 5 sons likés → rembourse le budget
      // EN ENTIER (chaque like sur un son 'refused' est exclu du calcul du
      // budget dépensé, cf. lib/server/playlist.ts countMySpentLikes).
      for (let i = 0; i < 5; i++) {
        const refused = await setSongStatus({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: songIds[i], status: 'refused' })
        expect(refused.ok).toBe(true)
      }

      // Le budget est de nouveau disponible pour 5 NOUVEAUX likes, sur 5
      // chansons distinctes jamais likées auparavant (indices 6..10).
      for (let i = 6; i < 11; i++) {
        const r = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: songIds[i] })
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.liked).toBe(true)
      }

      // Et le budget (de nouveau plein) rejette bien un 6e like supplémentaire.
      const overBudgetAgain = await toggleLike({ id: liker.id, roles: ['client'] }, { eventId: event.id, songId: songIds[11] })
      expect(overBudgetAgain.ok).toBe(false)
      if (!overBudgetAgain.ok) {
        expect(overBudgetAgain.status).toBe(403)
        expect(overBudgetAgain.error).toBe('like_quota_exceeded')
      }
    })
  })

  // ───────────────── setSongStatus / removeSong / playNow / stopNow ──────────

  describe('modération (setSongStatus, removeSong, playNow, stopNow)', () => {
    async function seedModerationFixture() {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const author = await seedUser()
      await seedCheckedInTicket(event.id, author.id)
      const added = await addSong({ id: author.id, roles: ['client'] }, { eventId: event.id, title: 'Son à modérer' })
      if (!added.ok) throw new Error('seed failed')
      return { owner, event, author, songId: added.song.id }
    }

    it("refusé (403 staff_only) pour un roster 'serveur' et un roster 'scan' — l'allow-list playlist est plus étroite que l'échelle de rang de la commande sur place", async () => {
      const { event, songId } = await seedModerationFixture()
      const serveurUser = await seedUser()
      await addStaff(event.id, serveurUser.id, 'serveur')
      const scanUser = await seedUser()
      await addStaff(event.id, scanUser.id, 'scan')

      for (const staffUser of [serveurUser, scanUser]) {
        const statusResult = await setSongStatus({ id: staffUser.id, roles: ['client'] }, { eventId: event.id, songId, status: 'validated' })
        expect(statusResult.ok).toBe(false)
        if (!statusResult.ok) {
          expect(statusResult.status).toBe(403)
          expect(statusResult.error).toBe('staff_only')
        }

        const removeResult = await removeSong({ id: staffUser.id, roles: ['client'] }, { eventId: event.id, songId })
        expect(removeResult.ok).toBe(false)
        if (!removeResult.ok) expect(removeResult.error).toBe('staff_only')

        const playResult = await playNow({ id: staffUser.id, roles: ['client'] }, { eventId: event.id, songId })
        expect(playResult.ok).toBe(false)
        if (!playResult.ok) expect(playResult.error).toBe('staff_only')

        const stopResult = await stopNow({ id: staffUser.id, roles: ['client'] }, { eventId: event.id })
        expect(stopResult.ok).toBe(false)
        if (!stopResult.ok) expect(stopResult.error).toBe('staff_only')
      }
    })

    it("succès pour un roster 'dj', un roster 'manager', le propriétaire, et un appelant 'agent' sans autre lien avec l'événement", async () => {
      const { owner, event, songId } = await seedModerationFixture()
      const djUser = await seedUser()
      await addStaff(event.id, djUser.id, 'dj')
      const managerUser = await seedUser()
      await addStaff(event.id, managerUser.id, 'manager')
      const agentUser = await seedUser({ roles: ['agent'], activeRole: 'agent' })

      for (const moderator of [{ id: djUser.id, roles: ['client'] }, { id: managerUser.id, roles: ['client'] }, { id: owner.id, roles: ['client'] }, { id: agentUser.id, roles: ['agent'] }]) {
        const statusResult = await setSongStatus(moderator, { eventId: event.id, songId, status: 'validated' })
        expect(statusResult.ok).toBe(true)

        const playResult = await playNow(moderator, { eventId: event.id, songId })
        expect(playResult.ok).toBe(true)

        const playlistAfterPlay = await EventPlaylist.findOne({ eventId: event.id }).lean()
        expect(playlistAfterPlay?.nowPlaying?.id).toBe(songId)
        // playNow marque AUSSI le son "joué" dans la même action (mirrors
        // PlaylistDJPanel.jsx playNow()).
        expect(playlistAfterPlay?.songs.find((s) => s.id === songId)?.status).toBe('played')

        const stopResult = await stopNow(moderator, { eventId: event.id })
        expect(stopResult.ok).toBe(true)
        const playlistAfterStop = await EventPlaylist.findOne({ eventId: event.id }).lean()
        expect(playlistAfterStop?.nowPlaying).toBeNull()
      }

      const removeResult = await removeSong({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId })
      expect(removeResult.ok).toBe(true)
      const playlistAfterRemove = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlistAfterRemove?.songs.find((s) => s.id === songId)).toBeUndefined()
    })

    it('setSongStatus refuse un statut invalide (400 invalid_status)', async () => {
      const { owner, event, songId } = await seedModerationFixture()
      const result = await setSongStatus({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId, status: 'not_a_real_status' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_status')
    })

    it("removeSong renvoie 404 song_not_found (PAS ok:true) quand songId n'existe pas dans CET événement — id d'un autre événement, ou déjà supprimé", async () => {
      const { owner, event } = await seedModerationFixture()

      // Cas 1 : songId bogus / jamais existé sur cet événement.
      const bogus = await removeSong({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: 'does-not-exist' })
      expect(bogus.ok).toBe(false)
      if (!bogus.ok) {
        expect(bogus.status).toBe(404)
        expect(bogus.error).toBe('song_not_found')
      }

      // Cas 2 : songId réel, mais d'un AUTRE événement (le filtre Mongo reste
      // scopé à `{ eventId }`, donc rien n'est touché sur l'événement B — mais
      // avant le fix, l'appel scopé sur l'événement A renvoyait quand même
      // ok:true pour ce songId qui ne lui appartient pas).
      const owner2 = await seedUser()
      const event2 = await seedEvent(owner2.id)
      const author2 = await seedUser()
      await seedCheckedInTicket(event2.id, author2.id)
      const otherEventSong = await addSong({ id: author2.id, roles: ['client'] }, { eventId: event2.id, title: 'Son événement B' })
      expect(otherEventSong.ok).toBe(true)
      if (!otherEventSong.ok) return

      const crossEvent = await removeSong({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: otherEventSong.song.id })
      expect(crossEvent.ok).toBe(false)
      if (!crossEvent.ok) {
        expect(crossEvent.status).toBe(404)
        expect(crossEvent.error).toBe('song_not_found')
      }

      // Le son de l'événement B est bien resté intact (aucune écriture croisée).
      const playlistB = await EventPlaylist.findOne({ eventId: event2.id }).lean()
      expect(playlistB?.songs.find((s) => s.id === otherEventSong.song.id)).toBeDefined()

      // Cas 3 : suppression déjà effectuée une première fois → la seconde
      // tentative sur le MÊME songId doit aussi échouer en 404, pas ok:true.
      const { songId: realSongId, event: realEvent, owner: realOwner } = await seedModerationFixture()
      const first = await removeSong({ id: realOwner.id, roles: ['client'] }, { eventId: realEvent.id, songId: realSongId })
      expect(first.ok).toBe(true)
      const second = await removeSong({ id: realOwner.id, roles: ['client'] }, { eventId: realEvent.id, songId: realSongId })
      expect(second.ok).toBe(false)
      if (!second.ok) {
        expect(second.status).toBe(404)
        expect(second.error).toBe('song_not_found')
      }
    })

    it("refuser le morceau EN COURS retire aussi la bannière nowPlaying (mirrors PlaylistDJPanel.jsx patchStatus ligne 64) ; refuser un AUTRE morceau la laisse intacte", async () => {
      const { owner, event, songId } = await seedModerationFixture()
      const author2 = await seedUser()
      await seedCheckedInTicket(event.id, author2.id)
      const other = await addSong({ id: author2.id, roles: ['client'] }, { eventId: event.id, title: 'Autre son' })
      expect(other.ok).toBe(true)
      if (!other.ok) return

      await playNow({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId })

      const refuseOther = await setSongStatus({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: other.song.id, status: 'refused' })
      expect(refuseOther.ok).toBe(true)
      let playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.nowPlaying?.id).toBe(songId) // pas touché : ce n'est pas le son en cours

      const refuseCurrent = await setSongStatus({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId, status: 'refused' })
      expect(refuseCurrent.ok).toBe(true)
      playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.nowPlaying).toBeNull()
    })

    it('supprimer le morceau EN COURS retire aussi la bannière nowPlaying (mirrors PlaylistDJPanel.jsx remove() ligne 75)', async () => {
      const { owner, event, songId } = await seedModerationFixture()
      await playNow({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId })

      let playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.nowPlaying?.id).toBe(songId)

      const removed = await removeSong({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId })
      expect(removed.ok).toBe(true)

      playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.nowPlaying).toBeNull()
    })
  })

  // ────────────────────────────── removeOwnSong ───────────────────────────

  describe('removeOwnSong', () => {
    it("chemin heureux : l'auteur retire l'un de ses propres sons, libérant un slot de quota", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id) // 1 billet → 1 slot

      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son à remplacer' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const before = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(before.ok).toBe(true)
      if (before.ok) expect(before.songsRemaining).toBe(0)

      const removed = await removeOwnSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(removed.ok).toBe(true)

      const after = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(after.ok).toBe(true)
      if (after.ok) expect(after.songsRemaining).toBe(1) // le slot est libéré, sans compteur séparé à maintenir

      // Reproposer un NOUVEAU son ("remplacer") doit maintenant réussir.
      const replaced = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son de remplacement' })
      expect(replaced.ok).toBe(true)
    })

    it("refusé (403 not_song_owner) de retirer le son de QUELQU'UN D'AUTRE", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const author = await seedUser()
      await seedCheckedInTicket(event.id, author.id)
      const added = await addSong({ id: author.id, roles: ['client'] }, { eventId: event.id, title: 'Son A' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const stranger = await seedUser()
      const result = await removeOwnSong({ id: stranger.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('not_song_owner')

      // Même un MODÉRATEUR (owner de l'événement) ne peut pas passer par cette
      // fonction self-service pour retirer le son de quelqu'un d'autre — c'est
      // le rôle de removeSong (modération), pas de removeOwnSong.
      const byOwner = await removeOwnSong({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(byOwner.ok).toBe(false)
      if (!byOwner.ok) expect(byOwner.error).toBe('not_song_owner')
    })

    it('renvoie 404 song_not_found pour un songId inexistant ou déjà supprimé', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)

      const bogus = await removeOwnSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, songId: 'does-not-exist' })
      expect(bogus.ok).toBe(false)
      if (!bogus.ok) {
        expect(bogus.status).toBe(404)
        expect(bogus.error).toBe('song_not_found')
      }
    })

    it("le PARTICIPANT retirant SON PROPRE morceau alors EN COURS retire aussi la bannière nowPlaying (même garde que removeSong ci-dessus, ligne 75 de PlaylistDJPanel.jsx)", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)

      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son en cours' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const played = await playNow({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(played.ok).toBe(true)

      let playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.nowPlaying?.id).toBe(added.song.id)

      const removed = await removeOwnSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      expect(removed.ok).toBe(true)

      playlist = await EventPlaylist.findOne({ eventId: event.id }).lean()
      expect(playlist?.songs.some((s) => s.id === added.song.id)).toBe(false)
      expect(playlist?.nowPlaying).toBeNull() // pas de bannière fantôme pointant vers un son qui n'existe plus
    })
  })

  // ────────────────────────────── getPlaylist ─────────────────────────────

  describe('getPlaylist', () => {
    it('accessible à tout appelant authentifié, même sans aucun billet ; canModerate/songsRemaining/likesRemaining/isCheckedIn exacts pour plusieurs profils', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)

      const plainStranger = await seedUser()
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)
      await seedCheckedInTicket(event.id, holder.id) // 2 billets
      const djUser = await seedUser()
      await addStaff(event.id, djUser.id, 'dj')

      // Un son ajouté par holder consomme un slot et sert de test pour
      // "cannot like own song" via songsRemaining/likesRemaining exacts.
      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son du holder' })
      expect(added.ok).toBe(true)
      if (!added.ok) return
      const holderSongId = added.song.id

      // Profil 1 : non-participant (0 billet).
      const strangerView = await getPlaylist({ id: plainStranger.id, roles: ['client'] }, { eventId: event.id })
      expect(strangerView.ok).toBe(true)
      if (strangerView.ok) {
        expect(strangerView.canModerate).toBe(false)
        expect(strangerView.songsRemaining).toBe(0)
        expect(strangerView.likesRemaining).toBe(5)
        expect(strangerView.isCheckedIn).toBe(false)
        expect(strangerView.hasTicket).toBe(false)
        expect(strangerView.ticketCount).toBe(0)
        expect(strangerView.songs.length).toBeGreaterThan(0) // vue publique, visible malgré 0 billet
        // Anonymisation : un étranger ne voit jamais le vrai nom de l'auteur.
        const holderSong = strangerView.songs.find((s) => s.id === holderSongId)
        expect(holderSong?.addedByName).toBe('')
      }

      // Profil 2 : titulaire scanné, 2 billets, 1 son déjà ajouté → 1 restant.
      const holderView = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(holderView.ok).toBe(true)
      if (holderView.ok) {
        expect(holderView.canModerate).toBe(false)
        expect(holderView.songsRemaining).toBe(1)
        expect(holderView.likesRemaining).toBe(5)
        expect(holderView.isCheckedIn).toBe(true)
        expect(holderView.hasTicket).toBe(true)
        expect(holderView.ticketCount).toBe(2)
        // Le contributeur voit son PROPRE nom sur son propre son.
        const ownSong = holderView.songs.find((s) => s.addedBy === holder.id)
        expect(ownSong?.addedByName).not.toBe('')
      }

      // Profil 3 : DJ (roster) — modérateur, mais pas participant lui-même.
      const djView = await getPlaylist({ id: djUser.id, roles: ['client'] }, { eventId: event.id })
      expect(djView.ok).toBe(true)
      if (djView.ok) {
        expect(djView.canModerate).toBe(true)
        expect(djView.songsRemaining).toBe(0)
        expect(djView.isCheckedIn).toBe(false)
        expect(djView.hasTicket).toBe(false)
        // Anonymisation : même le DJ/l'équipe modératrice ne voit jamais le
        // vrai nom d'un participant (mirrors PlaylistDJPanel.jsx, qui n'affiche
        // aucun nom du tout).
        const holderSongForDj = djView.songs.find((s) => s.addedBy === holder.id)
        expect(holderSongForDj?.addedByName).toBe('')
      }
    })

    it("l'auteur d'un son voit toujours son propre nom, quel que soit le statut du son", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)
      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Mon son' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const view = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(view.ok).toBe(true)
      if (view.ok) {
        const mine = view.songs.find((s) => s.id === added.song.id)
        expect(mine?.addedByName).toBe(added.song.addedByName)
        expect(mine?.addedByName.length).toBeGreaterThan(0)
      }
    })

    it("nowPlaying s'auto-masque 30 minutes après avoir été posé (mirrors PlaylistSystem.jsx ligne 536 / PlaylistDJPanel.jsx ligne 191)", async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)
      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Vieux son' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      await playNow({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })

      // Toujours visible juste après avoir été posé.
      const fresh = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(fresh.ok).toBe(true)
      if (fresh.ok) expect(fresh.nowPlaying?.id).toBe(added.song.id)

      // On recule artificiellement l'horodatage de 31 minutes (au-delà du
      // seuil de 30 min) directement en base, sans passer par playNow.
      await EventPlaylist.updateOne({ eventId: event.id }, { $set: { 'nowPlaying.at': new Date(Date.now() - 31 * 60 * 1000) } })

      const stale = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(stale.ok).toBe(true)
      if (stale.ok) expect(stale.nowPlaying).toBeNull()
    })

    it('reflète nowPlaying après playNow/stopNow', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedCheckedInTicket(event.id, holder.id)
      const added = await addSong({ id: holder.id, roles: ['client'] }, { eventId: event.id, title: 'Son en cours' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      await playNow({ id: owner.id, roles: ['client'] }, { eventId: event.id, songId: added.song.id })
      const withNowPlaying = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(withNowPlaying.ok).toBe(true)
      if (withNowPlaying.ok) expect(withNowPlaying.nowPlaying?.id).toBe(added.song.id)

      await stopNow({ id: owner.id, roles: ['client'] }, { eventId: event.id })
      const withoutNowPlaying = await getPlaylist({ id: holder.id, roles: ['client'] }, { eventId: event.id })
      expect(withoutNowPlaying.ok).toBe(true)
      if (withoutNowPlaying.ok) expect(withoutNowPlaying.nowPlaying).toBeNull()
    })
  })

  // ─────────────────────────────── canModeratePlaylist ────────────────────

  describe('canModeratePlaylist (unitaire, pas de DB)', () => {
    const event = { organizerId: 'owner-1', createdBy: 'owner-1' }

    it("autorise le propriétaire, l'agent (bypass), et les rôles roster 'dj'/'manager'", () => {
      expect(canModeratePlaylist('owner-1', ['client'], event, undefined)).toBe(true)
      expect(canModeratePlaylist('agent-1', ['agent'], event, undefined)).toBe(true)
      expect(canModeratePlaylist('dj-1', ['client'], event, { 'dj-1': { role: 'dj' } })).toBe(true)
      expect(canModeratePlaylist('mgr-1', ['client'], event, { 'mgr-1': { role: 'manager' } })).toBe(true)
    })

    it("refuse 'serveur'/'scan' et un simple client sans rôle roster", () => {
      expect(canModeratePlaylist('srv-1', ['client'], event, { 'srv-1': { role: 'serveur' } })).toBe(false)
      expect(canModeratePlaylist('scn-1', ['client'], event, { 'scn-1': { role: 'scan' } })).toBe(false)
      expect(canModeratePlaylist('rando-1', ['client'], event, undefined)).toBe(false)
    })
  })

  // ───────────────────────────── hasEventParticipation ────────────────────

  describe('hasEventParticipation', () => {
    it('compte les billets non révoqués et détecte un check-in réel', async () => {
      const owner = await seedUser()
      const event = await seedEvent(owner.id)
      const holder = await seedUser()
      await seedTicket(event.id, holder.id) // non scanné
      await seedCheckedInTicket(event.id, holder.id) // scanné
      await seedTicket(event.id, holder.id, { revoked: true }) // révoqué, exclu du compte

      const participation = await hasEventParticipation(holder.id, event.id)
      expect(participation.ticketCount).toBe(2) // les 2 non révoqués
      expect(participation.hasCheckedIn).toBe(true)
    })
  })
})

// ────────────────────────── searchSongs (réseau réel) ───────────────────────

// searchSongs fait un VRAI appel `fetch` vers itunes.apple.com — si
// l'environnement d'exécution n'a pas d'accès réseau sortant, ce bloc est
// sauté explicitement (describe séparé, décision documentée dans le prompt de
// cette phase) plutôt que de laisser un échec réseau bloquer TOUTE la suite.
// Un mock de fetch couvre en plus le mapping de champs (invariant sous test,
// indépendant du réseau) et le cas d'échec réseau (502 search_unavailable).
describe('searchSongs', () => {
  it('mappe la réponse iTunes vers {title, artist, previewUrl, cover, duration} uniquement (fetch mocké)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            trackName: 'Song A',
            artistName: 'Artist A',
            previewUrl: 'https://a/preview.m4a',
            artworkUrl100: 'https://a/art.jpg',
            trackId: 123,
            trackTimeMillis: 225000,
          },
          { trackName: '', artistName: 'No Title Artist' }, // filtré : pas de trackName exploitable
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await searchSongs({ id: 'caller-1', roles: ['client'] }, { query: 'song a' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.results).toEqual([
        { title: 'Song A', artist: 'Artist A', previewUrl: 'https://a/preview.m4a', cover: 'https://a/art.jpg', duration: '3:45' },
      ])
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('itunes.apple.com/search'))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renvoie une duration vide si trackTimeMillis est absent (fetch mocké)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ trackName: 'Song B', artistName: 'Artist B' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await searchSongs({ id: 'caller-1', roles: ['client'] }, { query: 'song b' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.results[0].duration).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renvoie 502 search_unavailable si le fetch réseau échoue (mocké)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    )
    try {
      const result = await searchSongs({ id: 'caller-1', roles: ['client'] }, { query: 'anything' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(502)
      expect(result.error).toBe('search_unavailable')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejette une requête vide (400 invalid_query), sans appeler fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      const result = await searchSongs({ id: 'caller-1', roles: ['client'] }, { query: '   ' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_query')
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
