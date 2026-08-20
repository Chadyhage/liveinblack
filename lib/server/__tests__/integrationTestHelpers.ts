import mongoose from 'mongoose'
import { beforeAll, afterAll, beforeEach } from 'vitest'
import Conversation from '../../models/Conversation'
import Event from '../../models/Event'
import User from '../../models/User'

export const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
export const TEST_URI = process.env.MONGODB_URI || ''

export async function seedUser(overrides: Record<string, unknown> = {}) {
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

export function fakeObjectId(): string {
  return new mongoose.Types.ObjectId().toString()
}

export async function seedDirectConversation(participantIds: string[], overrides: Record<string, unknown> = {}) {
  return Conversation.create({
    type: 'direct',
    participantIds,
    ...overrides,
  })
}

export async function seedCatalogEvent(overrides: Record<string, unknown> = {}) {
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

export function setupMongoIntegrationSuite(
  resetCollections: Array<{ deleteMany: (filter: Record<string, never>) => Promise<unknown> }>,
  options?: { beforeEachExtra?: () => void | Promise<void> }
) {
  beforeAll(async () => {
    if (!RUN_INTEGRATION) return
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(TEST_URI)
    }
  }, 20000)

  afterAll(async () => {
    if (!RUN_INTEGRATION) return
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
    }
  })

  beforeEach(async () => {
    if (!RUN_INTEGRATION) return
    await Promise.all(resetCollections.map((collection) => collection.deleteMany({})))
    await options?.beforeEachExtra?.()
  })
}
