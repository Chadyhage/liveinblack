import mongoose from 'mongoose'

// Connexion Mongoose mise en cache sur `globalThis`, même intention que le
// pattern getDb() de lib/firebaseAdmin.js côté legacy : une seule connexion
// réutilisée entre les invocations de fonctions serverless (Next.js peut
// recharger ce module à chaud en dev, d'où le cache sur globalThis plutôt
// que sur une simple variable de module).

const MONGODB_URI = process.env.MONGODB_URI

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined
}

const cache: MongooseCache = globalThis.__mongooseCache ?? { conn: null, promise: null }
globalThis.__mongooseCache = cache

export async function getDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI manquant — définis-le dans web/.env.local')
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    })
  }

  try {
    cache.conn = await cache.promise
  } catch (err) {
    cache.promise = null
    throw err
  }

  return cache.conn
}
