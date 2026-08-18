import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mongoMock = vi.hoisted(() => ({
  constructor: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(async () => undefined),
}))

vi.mock('mongodb', () => ({
  MongoClient: vi.fn(function MockMongoClient() {
    const client = {
      connect: () => mongoMock.connect(client),
      close: () => mongoMock.close(),
    }
    mongoMock.constructor(client)
    return client
  }),
}))

const originalUri = process.env.MONGODB_URI

beforeEach(() => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/liveinblack_test'
  delete globalThis.__mongoClientCache
  vi.resetModules()
  mongoMock.constructor.mockClear()
  mongoMock.connect.mockReset()
  mongoMock.close.mockClear()
})

afterEach(() => {
  if (originalUri === undefined) delete process.env.MONGODB_URI
  else process.env.MONGODB_URI = originalUri
})

describe('getMongoClient', () => {
  it('ne démarre aucune connexion au simple import et réutilise le client connecté', async () => {
    const mongoClientModule = await import('../mongodb-client')
    expect(mongoMock.constructor).not.toHaveBeenCalled()

    mongoMock.connect.mockImplementation(async (client) => client)
    const first = await mongoClientModule.getMongoClient()
    const second = await mongoClientModule.getMongoClient()

    expect(first).toBe(second)
    expect(mongoMock.constructor).toHaveBeenCalledTimes(1)
    expect(mongoMock.connect).toHaveBeenCalledTimes(1)
  })

  it('réessaie une connexion transitoirement refusée puis met le succès en cache', async () => {
    mongoMock.connect
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(async (client) => client)

    const { getMongoClient } = await import('../mongodb-client')
    const client = await getMongoClient()

    expect(client).toBeTruthy()
    expect(mongoMock.constructor).toHaveBeenCalledTimes(3)
    expect(mongoMock.connect).toHaveBeenCalledTimes(3)
    expect(mongoMock.close).toHaveBeenCalledTimes(2)
  })

  it('oublie un échec définitif pour permettre une nouvelle tentative ultérieure', async () => {
    mongoMock.connect.mockRejectedValue(new Error('network'))
    const { getMongoClient } = await import('../mongodb-client')

    await expect(getMongoClient()).rejects.toThrow('network')
    expect(mongoMock.connect).toHaveBeenCalledTimes(3)

    mongoMock.connect.mockReset()
    mongoMock.connect.mockImplementationOnce(async (client) => client)
    await expect(getMongoClient()).resolves.toBeTruthy()
    expect(mongoMock.connect).toHaveBeenCalledTimes(1)
  })
})
