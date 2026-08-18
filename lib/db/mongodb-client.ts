import { MongoClient } from 'mongodb'

// Client MongoDB natif séparé de la connexion Mongoose :
// @auth/mongodb-adapter accepte et recommande une fonction paresseuse. Une
// promesse de connexion créée à l'import peut rejeter avant d'être attendue,
// produire un unhandledRejection et rester définitivement rejetée dans une
// fonction serverless réutilisée. Ici, rien ne se connecte avant le premier
// besoin réel et tout échec remet le cache dans un état réessayable.

const MONGODB_URI = process.env.MONGODB_URI
const MAX_CONNECT_ATTEMPTS = 3
const MAX_POOL_SIZE = Math.max(1, Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? '20', 10) || 20)
const MIN_POOL_SIZE = Math.max(0, Number.parseInt(process.env.MONGODB_MIN_POOL_SIZE ?? '0', 10) || 0)

type MongoClientCache = {
  client: MongoClient | null
  promise: Promise<MongoClient> | null
}

declare global {
  var __mongoClientCache: MongoClientCache | undefined
}

const cache: MongoClientCache = globalThis.__mongoClientCache ?? { client: null, promise: null }
globalThis.__mongoClientCache = cache

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectWithRetry(uri: string): Promise<MongoClient> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      waitQueueTimeoutMS: 5_000,
      maxIdleTimeMS: 120_000,
      maxPoolSize: MAX_POOL_SIZE,
      minPoolSize: MIN_POOL_SIZE,
      family: 4,
      retryReads: true,
      retryWrites: true,
      heartbeatFrequencyMS: 10_000,
    })

    try {
      return await client.connect()
    } catch (error) {
      lastError = error
      await client.close().catch(() => undefined)
      if (attempt < MAX_CONNECT_ATTEMPTS) await delay(attempt === 1 ? 350 : 1_000)
    }
  }

  throw lastError
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.client) return cache.client
  if (!MONGODB_URI) throw new Error('MONGODB_URI manquant — définis-le dans web/.env.local')

  if (!cache.promise) {
    cache.promise = connectWithRetry(MONGODB_URI)
      .then((client) => {
        cache.client = client
        return client
      })
      .catch((error) => {
        cache.promise = null
        throw error
      })
  }

  return cache.promise
}

export default getMongoClient
