import { MongoClient } from 'mongodb'

// Client MongoDB natif séparé de la connexion Mongoose : @auth/mongodb-adapter
// attend un `Promise<MongoClient>`, pas une connexion Mongoose. Les deux
// clients pointent vers la même base ; ce n'est pas une deuxième base de
// données, juste deux façons de parler au même cluster Atlas.

const MONGODB_URI = process.env.MONGODB_URI

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined
}

function createClientPromise(): Promise<MongoClient> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI manquant — définis-le dans web/.env.local')
  }
  const client = new MongoClient(MONGODB_URI)
  return client.connect()
}

const clientPromise: Promise<MongoClient> = globalThis.__mongoClientPromise ?? createClientPromise()
globalThis.__mongoClientPromise = clientPromise

export default clientPromise
