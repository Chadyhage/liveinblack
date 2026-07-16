// Tests d'INTÉGRATION (vraie base MongoDB) pour les sondages de conversation
// (poll + event_poll). Couvre en particulier :
//  - création : validation question/options, garde conversation/mute ;
//  - event_poll : le snapshot événement vient TOUJOURS de l'Event chargé
//    serveur, jamais d'une valeur soufflée par le client ;
//  - vote : single-select (voter pour une option retire le vote précédent
//    sur une autre), toggle (revoter la même option retire le vote) ;
//  - le CHEMIN PARTAGÉ poll/event_poll pour le vote (#42, cf. CLAUDE.md) ;
//  - la CONCURRENCE réelle : le correctif du bug legacy "last-write-wins"
//    via le pipeline d'agrégation atomique (voir lib/server/polls.ts).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createPoll, createEventPoll, voteOnPoll } from '../polls'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import Event from '../../models/Event'
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
  await Promise.all([Conversation.deleteMany({}), Message.deleteMany({}), Event.deleteMany({}), User.deleteMany({})])
})

// userId/participantIds doivent être de vrais ObjectId Mongo (comme en prod,
// où ils viennent toujours de session.user.id = String(user._id)) — jamais
// de chaînes arbitraires ('user-1') : Mongoose lève un CastError sur
// User.findById avec une telle chaîne, et Conversation.findById(messageId)
// se comporterait différemment d'un vrai id.
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

async function seedConversation(participantIds: string[], overrides: Record<string, unknown> = {}) {
  return Conversation.create({
    type: 'direct',
    participantIds,
    ...overrides,
  })
}

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Soirée Test XYZ',
    date: '2099-06-15',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    imageUrl: 'https://example.com/event.jpg',
    places: [
      { id: 'vip', type: 'VIP', price: 3000, available: 5, total: 5 },
      { id: 'std', type: 'Standard', price: 1000, available: 20, total: 20 },
      { id: 'tbl', type: 'Table', price: 2000, available: 3, total: 3 },
    ],
    ...overrides,
  })
}

describeIntegration('polls (intégration, mise à jour atomique) — poll + event_poll (#42)', () => {
  describe('createPoll', () => {
    it('crée un sondage et met à jour l’aperçu de conversation', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id])

      const result = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: '  On sort où ce soir ?  ', options: ['Le Black', 'Le Rouge'] })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.message.type).toBe('poll')
      expect(result.message.senderId).toBe(alice.id)
      expect(result.message.poll.pollType).toBe('poll')
      expect(result.message.poll.question).toBe('On sort où ce soir ?')
      expect(result.message.poll.options).toEqual([
        { id: '0', text: 'Le Black', voterIds: [] },
        { id: '1', text: 'Le Rouge', voterIds: [] },
      ])
      expect(result.message.poll.event).toBeNull()

      const freshConv = await Conversation.findById(conversation.id).lean()
      expect(freshConv?.lastMessage).toBe('Sondage : On sort où ce soir ?')
      expect(freshConv?.lastSenderId).toBe(alice.id)
      expect(freshConv?.lastMessageAt).toBeTruthy()
    })

    it('refuse une question vide après trim (question_required)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])

      const result = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: '   ', options: ['A', 'B'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('question_required')
    })

    it('refuse une seule option (invalid_options)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])

      const result = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Solo'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_options')
    })

    it('refuse sept options (invalid_options)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])

      const result = await createPoll(
        { id: alice.id },
        { conversationId: conversation.id, question: 'Q ?', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_options')
    })

    it('refuse deux options identiques après trim + minuscule (invalid_options)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])

      const result = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Le Black', '  LE BLACK  '] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_options')
    })

    it("refuse un appelant qui n'est pas participant (conversation_not_found)", async () => {
      const alice = await seedUser()
      const outsider = await seedUser()
      const conversation = await seedConversation([alice.id])

      const result = await createPoll({ id: outsider.id }, { conversationId: conversation.id, question: 'Q ?', options: ['A', 'B'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })

    it('refuse un participant muet dans un groupe (muted)', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id], { type: 'group', name: 'Groupe Test', mutedUserIds: [bob.id] })

      const result = await createPoll({ id: bob.id }, { conversationId: conversation.id, question: 'Q ?', options: ['A', 'B'] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('muted')
    })
  })

  describe('createEventPoll', () => {
    it("crée un sondage-événement avec un snapshot fidèle à l'Event chargé serveur", async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id])
      const event = await seedEvent()

      // Le contrat de createEventPoll n'accepte que {conversationId, eventId}
      // — on force ici un input avec des champs événement supplémentaires
      // (comme le ferait un client malveillant en modifiant le JSON envoyé)
      // pour vérifier qu'ils sont bien ignorés et jamais reflétés dans le
      // snapshot final.
      const maliciousInput = {
        conversationId: conversation.id,
        eventId: event.id,
        event: { name: 'FAUX NOM INJECTÉ', price: 999999 },
      } as unknown as { conversationId: string; eventId: string }

      const result = await createEventPoll({ id: alice.id }, maliciousInput)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.message.type).toBe('event_poll')
      expect(result.message.poll.pollType).toBe('event_poll')
      expect(result.message.poll.question).toBe('On y va ?')
      expect(result.message.poll.options).toEqual([
        { id: 'yes', text: 'Oui', voterIds: [] },
        { id: 'no', text: 'Non', voterIds: [] },
      ])
      // Le snapshot vient EXCLUSIVEMENT de l'Event réellement chargé — jamais
      // de ce que le test a tenté d'injecter dans l'input.
      expect(result.message.poll.event?.name).toBe('Soirée Test XYZ')
      expect(result.message.poll.event?.id).toBe(event.id)
      expect(result.message.poll.event?.currency).toBe('EUR')
      expect(result.message.poll.event?.image).toBe('https://example.com/event.jpg')
      // Prix = place la moins chère (1000), pas 3000 (première place du
      // tableau) ni 999999 (valeur injectée).
      expect(result.message.poll.event?.price).toBe(1000)

      const freshConv = await Conversation.findById(conversation.id).lean()
      expect(freshConv?.lastMessage).toBe('Sondage événement : Soirée Test XYZ')
    })

    it('refuse un eventId inexistant (event_not_found)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])
      const bogusId = new mongoose.Types.ObjectId().toString()

      const result = await createEventPoll({ id: alice.id }, { conversationId: conversation.id, eventId: bogusId })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('event_not_found')
    })

    it("refuse un appelant qui n'est pas participant (conversation_not_found)", async () => {
      const alice = await seedUser()
      const outsider = await seedUser()
      const conversation = await seedConversation([alice.id])
      const event = await seedEvent()

      const result = await createEventPoll({ id: outsider.id }, { conversationId: conversation.id, eventId: event.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('conversation_not_found')
    })
  })

  describe('voteOnPoll — sondage PLAIN (poll)', () => {
    it('premier vote enregistré, puis un vote pour une AUTRE option retire le premier', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id])
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const firstVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: '0' })
      expect(firstVote.ok).toBe(true)
      if (!firstVote.ok) return
      expect(firstVote.options.find((o) => o.id === '0')?.voterIds).toEqual([alice.id])
      expect(firstVote.options.find((o) => o.id === '1')?.voterIds).toEqual([])

      const secondVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: '1' })
      expect(secondVote.ok).toBe(true)
      if (!secondVote.ok) return
      // Le vote précédent sur l'option 0 est RETIRÉ, pas seulement le nouveau
      // ajouté sur l'option 1 — on vérifie les DEUX tableaux, pas seulement
      // la cible.
      expect(secondVote.options.find((o) => o.id === '0')?.voterIds).toEqual([])
      expect(secondVote.options.find((o) => o.id === '1')?.voterIds).toEqual([alice.id])
    })

    it('revoter pour la MÊME option bascule le vote (retrait, pas un doublon)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const firstVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: '0' })
      expect(firstVote.ok).toBe(true)
      if (!firstVote.ok) return
      expect(firstVote.options.find((o) => o.id === '0')?.voterIds).toEqual([alice.id])

      const toggleOff = await voteOnPoll({ id: alice.id }, { messageId, optionId: '0' })
      expect(toggleOff.ok).toBe(true)
      if (!toggleOff.ok) return
      expect(toggleOff.options.find((o) => o.id === '0')?.voterIds).toEqual([])
      expect(toggleOff.options.find((o) => o.id === '1')?.voterIds).toEqual([])
    })

    it('refuse un optionId invalide SANS muter le sondage (invalid_option)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const result = await voteOnPoll({ id: alice.id }, { messageId, optionId: 'nope' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_option')

      const fresh = await Message.findById(messageId).lean()
      expect(fresh?.poll?.options.every((o) => (o.voterIds ?? []).length === 0)).toBe(true)
    })

    it("refuse un non-participant SANS enregistrer aucun vote (poll_not_found)", async () => {
      const alice = await seedUser()
      const outsider = await seedUser()
      const conversation = await seedConversation([alice.id])
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const result = await voteOnPoll({ id: outsider.id }, { messageId, optionId: '0' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('poll_not_found')

      const fresh = await Message.findById(messageId).lean()
      expect(fresh?.poll?.options.every((o) => (o.voterIds ?? []).length === 0)).toBe(true)
    })

    it("refuse un participant muet dans un groupe SANS enregistrer aucun vote (muted) — même autorisation que créer/envoyer un message", async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      // Le groupe est créé SANS bob dans mutedUserIds, pour que la création
      // du sondage par alice réussisse ; bob est muté APRÈS coup, comme un
      // admin de groupe le ferait en pratique.
      const conversation = await seedConversation([alice.id, bob.id], { type: 'group', name: 'Groupe Test' })
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      conversation.mutedUserIds = [bob.id]
      await conversation.save()

      const result = await voteOnPoll({ id: bob.id }, { messageId, optionId: '0' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('muted')

      const fresh = await Message.findById(messageId).lean()
      expect(fresh?.poll?.options.every((o) => (o.voterIds ?? []).length === 0)).toBe(true)
    })
  })

  describe('voteOnPoll — sondage EVENT_POLL (chemin partagé, #42)', () => {
    it('premier vote enregistré, puis un vote pour l’autre option retire le premier — sur un vrai event_poll', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id])
      const event = await seedEvent()
      const created = await createEventPoll({ id: alice.id }, { conversationId: conversation.id, eventId: event.id })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      expect(created.message.poll.pollType).toBe('event_poll')
      const messageId = created.message.id

      const firstVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: 'yes' })
      expect(firstVote.ok).toBe(true)
      if (!firstVote.ok) return
      expect(firstVote.options.find((o) => o.id === 'yes')?.voterIds).toEqual([alice.id])
      expect(firstVote.options.find((o) => o.id === 'no')?.voterIds).toEqual([])

      const secondVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: 'no' })
      expect(secondVote.ok).toBe(true)
      if (!secondVote.ok) return
      expect(secondVote.options.find((o) => o.id === 'yes')?.voterIds).toEqual([])
      expect(secondVote.options.find((o) => o.id === 'no')?.voterIds).toEqual([alice.id])

      // Confirme que le message est TOUJOURS bien un event_poll après vote
      // (le pipeline atomique ne touche qu'à `poll.options`, jamais à
      // `poll.pollType`/`poll.event`).
      const fresh = await Message.findById(messageId).lean()
      expect(fresh?.poll?.pollType).toBe('event_poll')
      expect(fresh?.poll?.event?.name).toBe('Soirée Test XYZ')
    })

    it('revoter pour la même option bascule le vote — sur un event_poll', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])
      const event = await seedEvent()
      const created = await createEventPoll({ id: alice.id }, { conversationId: conversation.id, eventId: event.id })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const firstVote = await voteOnPoll({ id: alice.id }, { messageId, optionId: 'yes' })
      expect(firstVote.ok).toBe(true)
      if (!firstVote.ok) return
      expect(firstVote.options.find((o) => o.id === 'yes')?.voterIds).toEqual([alice.id])

      const toggleOff = await voteOnPoll({ id: alice.id }, { messageId, optionId: 'yes' })
      expect(toggleOff.ok).toBe(true)
      if (!toggleOff.ok) return
      expect(toggleOff.options.find((o) => o.id === 'yes')?.voterIds).toEqual([])
    })

    it('refuse un optionId invalide sur un event_poll (invalid_option)', async () => {
      const alice = await seedUser()
      const conversation = await seedConversation([alice.id])
      const event = await seedEvent()
      const created = await createEventPoll({ id: alice.id }, { conversationId: conversation.id, eventId: event.id })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      const result = await voteOnPoll({ id: alice.id }, { messageId: created.message.id, optionId: 'maybe' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('invalid_option')
    })
  })

  describe('voteOnPoll — concurrence (correctif du bug legacy)', () => {
    it('deux votes SIMULTANÉS de deux utilisateurs différents sur deux options différentes du même message : aucun vote perdu, aucune contamination croisée', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const conversation = await seedConversation([alice.id, bob.id])
      const created = await createPoll({ id: alice.id }, { conversationId: conversation.id, question: 'Q ?', options: ['Option A', 'Option B'] })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const messageId = created.message.id

      const [aliceResult, bobResult] = await Promise.all([
        voteOnPoll({ id: alice.id }, { messageId, optionId: '0' }),
        voteOnPoll({ id: bob.id }, { messageId, optionId: '1' }),
      ])

      expect(aliceResult.ok).toBe(true)
      expect(bobResult.ok).toBe(true)

      // Source de vérité finale : relecture fraîche depuis Mongo, après que
      // les DEUX opérations concurrentes ont committé.
      const fresh = await Message.findById(messageId).lean()
      const optionA = fresh?.poll?.options.find((o) => o.id === '0')
      const optionB = fresh?.poll?.options.find((o) => o.id === '1')
      expect(optionA?.voterIds).toEqual([alice.id])
      expect(optionB?.voterIds).toEqual([bob.id])
    })
  })
})
