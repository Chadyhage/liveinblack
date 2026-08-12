import { MongoClient } from 'mongodb'

// Client MongoDB natif séparé de la connexion Mongoose : @auth/mongodb-adapter
// attend un `Promise<MongoClient>`, pas une connexion Mongoose. Les deux
// clients pointent vers la même base ; ce n'est pas une deuxième base de
// données, juste deux façons de parler au même cluster Atlas.

const MONGODB_URI = process.env.MONGODB_URI

declare global {
   
  var __mongoClientPromise: Promise<MongoClient> | undefined
}

// Enveloppé dans une IIFE async — jamais un throw SYNCHRONE au chargement du
// module (bug confirmé le 12/08/2026 : cassait le build Vercel, "Collecting
// page data" importe toutes les routes, y compris celles import auth.ts →
// ce module → crash immédiat avant même qu'une requête n'arrive). Même
// principe que lib/db/mongoose.ts::getDb(), qui ne vérifie MONGODB_URI qu'À
// L'APPEL, jamais à l'import — ici la vérification doit rester dans le
// corps de la promesse (rejet asynchrone), jamais hors d'un `async`.
function createClientPromise(): Promise<MongoClient> {
  return (async () => {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI manquant — définis-le dans web/.env.local')
    }
    const client = new MongoClient(MONGODB_URI)
    return client.connect()
  })()
}

const clientPromise: Promise<MongoClient> = globalThis.__mongoClientPromise ?? createClientPromise()
globalThis.__mongoClientPromise = clientPromise

export default clientPromise
