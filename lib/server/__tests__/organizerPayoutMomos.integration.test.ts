// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/organizerPayoutMomos.ts
// (#7 phase organisateur — numéros Mobile Money par pays + réarmement des
// versements FedaPay bloqués faute de numéro).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { listPayoutMomos, updatePayoutMomos, rearmFailedPayouts } from '../organizerPayoutMomos'
import User from '../../models/User'
import Event from '../../models/Event'
import EventPayout from '../../models/EventPayout'

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
  await User.deleteMany({})
  await Event.deleteMany({})
  await EventPayout.deleteMany({})
})

async function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    ...overrides,
  })
  return String(user._id)
}

describeIntegration('organizerPayoutMomos (intégration, vraie base) — numéros Mobile Money + réarmement (#7)', () => {
  it('refuse un numéro invalide et ne modifie rien', async () => {
    const userId = await seedUser()
    const result = await updatePayoutMomos({ id: userId }, { tg: '+229 90 00 00 00' })
    expect(result.ok).toBe(false)

    const listed = await listPayoutMomos({ id: userId })
    expect(listed.ok).toBe(true)
    if (listed.ok) expect(listed.momos).toEqual({})
  })

  it('enregistre plusieurs numéros valides, un par pays', async () => {
    const userId = await seedUser()
    const result = await updatePayoutMomos({ id: userId }, { tg: '+228 90 00 00 00', bj: '+229 91 11 11 11' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.momos).toEqual({ tg: '+22890000000', bj: '+22991111111' })

    const listed = await listPayoutMomos({ id: userId })
    expect(listed.ok).toBe(true)
    if (listed.ok) expect(listed.momos).toEqual({ tg: '+22890000000', bj: '+22991111111' })
  })

  it('remplace entièrement la map — retirer un pays du payload le supprime', async () => {
    const userId = await seedUser()
    await updatePayoutMomos({ id: userId }, { tg: '+228 90 00 00 00', bj: '+229 91 11 11 11' })

    const result = await updatePayoutMomos({ id: userId }, { tg: '+228 90 00 00 00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.momos).toEqual({ tg: '+22890000000' })
  })

  it('réarme immédiatement une enveloppe bloquée "no_momo_number" dès qu’un numéro correspondant est ajouté', async () => {
    const userId = await seedUser()
    const event = await Event.create({ name: 'Soirée Togo', date: '2020-01-01', city: 'Lomé', region: 'Togo', organizerId: userId, createdBy: userId, places: [] })
    await EventPayout.create({
      eventId: String(event._id),
      sellerUid: userId,
      amountDueXOF: 15000,
      momoCountry: 'tg',
      status: 'failed',
      failReason: 'Aucun numéro Mobile Money enregistré pour Togo',
      failCode: 'no_momo_number',
    })

    const result = await updatePayoutMomos({ id: userId }, { tg: '+228 90 00 00 00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rearmedCount).toBe(1)

    const envelope = await EventPayout.findOne({ eventId: String(event._id) }).lean()
    expect(envelope?.status).toBe('accumulating')
    expect(envelope?.failCode).toBeNull()
    expect(envelope?.failReason).toBeNull()
  })

  it('ne réarme pas une enveloppe dont l’événement a été annulé', async () => {
    const userId = await seedUser()
    const event = await Event.create({ name: 'Soirée Togo', date: '2020-01-01', city: 'Lomé', region: 'Togo', organizerId: userId, createdBy: userId, places: [], cancelled: true })
    await EventPayout.create({ eventId: String(event._id), sellerUid: userId, amountDueXOF: 15000, momoCountry: 'tg', status: 'failed', failCode: 'no_momo_number' })

    const result = await updatePayoutMomos({ id: userId }, { tg: '+228 90 00 00 00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rearmedCount).toBe(0)

    const envelope = await EventPayout.findOne({ eventId: String(event._id) }).lean()
    expect(envelope?.status).toBe('failed')
  })

  it('ne réarme jamais un échec non ré-armable (ex. refus FedaPay)', async () => {
    const userId = await seedUser()
    const event = await Event.create({ name: 'Soirée Togo', date: '2020-01-01', city: 'Lomé', region: 'Togo', organizerId: userId, createdBy: userId, places: [] })
    await EventPayout.create({ eventId: String(event._id), sellerUid: userId, amountDueXOF: 15000, momoCountry: 'tg', status: 'failed', failCode: 'payout_rejected' })

    const rearmed = await rearmFailedPayouts(userId)
    expect(rearmed).toBe(0)

    const envelope = await EventPayout.findOne({ eventId: String(event._id) }).lean()
    expect(envelope?.status).toBe('failed')
  })

  it('dérive le pays depuis la région de l’événement quand momoCountry est absent sur l’enveloppe', async () => {
    const userId = await seedUser()
    const event = await Event.create({ name: 'Soirée Bénin', date: '2020-01-01', city: 'Cotonou', region: 'Bénin', organizerId: userId, createdBy: userId, places: [] })
    await EventPayout.create({ eventId: String(event._id), sellerUid: userId, amountDueXOF: 8000, momoCountry: null, status: 'failed', failCode: 'country_undetermined' })

    const result = await updatePayoutMomos({ id: userId }, { bj: '+229 91 11 11 11' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rearmedCount).toBe(1)

    const envelope = await EventPayout.findOne({ eventId: String(event._id) }).lean()
    expect(envelope?.status).toBe('accumulating')
    expect(envelope?.momoCountry).toBe('bj')
  })
})
