// Test d'INTÉGRATION pour POST /api/account/active-role — le switch de
// dashboard multi-rôle (voir app/(public)/_components/AccountMenu.tsx). La
// seule règle de sécurité qui compte : on ne peut jamais basculer vers un
// rôle absent de `user.roles`, quoi que le corps de la requête prétende.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import User, { ROLES } from '../../models/User'

type TestRole = (typeof ROLES)[number]

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

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
  await User.deleteMany({})
})

async function seedUser(roles: TestRole[], activeRole: TestRole) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Prenom',
    lastName: 'Nom',
    roles,
    activeRole,
  })
}

describeIntegration('POST /api/account/active-role', () => {
  it('bascule activeRole quand le rôle demandé fait partie de user.roles', async () => {
    const user = await seedUser(['client', 'organisateur'], 'client')
    mockCallerId = String(user._id)
    const { POST } = await import('../../../app/api/account/active-role/route')

    const req = new Request('http://localhost/api/account/active-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'organisateur' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.activeRole).toBe('organisateur')

    const persisted = await User.findById(user._id).lean()
    expect(persisted?.activeRole).toBe('organisateur')
  })

  it("refuse (403) un rôle absent de user.roles, sans modifier activeRole", async () => {
    const user = await seedUser(['client'], 'client')
    mockCallerId = String(user._id)
    const { POST } = await import('../../../app/api/account/active-role/route')

    const req = new Request('http://localhost/api/account/active-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'agent' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('role_not_owned')

    const persisted = await User.findById(user._id).lean()
    expect(persisted?.activeRole).toBe('client')
  })

  it('rejette (400) un rôle qui ne fait partie d’aucune valeur connue', async () => {
    const user = await seedUser(['client'], 'client')
    mockCallerId = String(user._id)
    const { POST } = await import('../../../app/api/account/active-role/route')

    const req = new Request('http://localhost/api/account/active-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'superadmin' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('401 quand non authentifié', async () => {
    mockCallerId = null
    const { POST } = await import('../../../app/api/account/active-role/route')

    const req = new Request('http://localhost/api/account/active-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'client' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
