import mongoose from 'mongoose'
import OrganizerProfile from '../models/OrganizerProfile'
import ProviderProfile from '../models/ProviderProfile'
import Event from '../models/Event'
import Conversation from '../models/Conversation'
import Message from '../models/Message'
import User from '../models/User'
import Order from '../models/Order'
import Ticket from '../models/Ticket'
import EventInterest from '../models/EventInterest'
import OrganizerFollow from '../models/OrganizerFollow'
import Application from '../models/Application'
import FriendRequest from '../models/FriendRequest'
import Notification from '../models/Notification'
import Report from '../models/Report'
import EventOrder from '../models/EventOrder'
import SeatHold from '../models/SeatHold'
import RateLimit from '../models/RateLimit'
import RefundCase from '../models/RefundCase'
import RefundPoint from '../models/RefundPoint'
import VercelDrainEvent from '../models/VercelDrainEvent'
import VercelSpendEvent from '../models/VercelSpendEvent'
import VercelPlatformEvent from '../models/VercelPlatformEvent'
import VercelOpsConfigChange from '../models/VercelOpsConfigChange'

// Connexion Mongoose mise en cache sur `globalThis`, même intention que le
// pattern getDb() de lib/firebaseAdmin.js côté legacy : une seule connexion
// réutilisée entre les invocations de fonctions serverless (Next.js peut
// recharger ce module à chaud en dev, d'où le cache sur globalThis plutôt
// que sur une simple variable de module).

const MONGODB_URI = process.env.MONGODB_URI
const MAX_CONNECT_ATTEMPTS = 3
const MAX_POOL_SIZE = Math.max(1, Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? '20', 10) || 20)
const MIN_POOL_SIZE = Math.max(0, Number.parseInt(process.env.MONGODB_MIN_POOL_SIZE ?? '0', 10) || 0)
let indexesInitialized = false
let indexesInitializing: Promise<void> | null = null

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
   
  var __mongooseCache: MongooseCache | undefined
}

const cache: MongooseCache = globalThis.__mongooseCache ?? { conn: null, promise: null }
globalThis.__mongooseCache = cache

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectWithRetry(uri: string): Promise<typeof mongoose> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await mongoose.connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS: 10_000,
        socketTimeoutMS: 30_000,
        waitQueueTimeoutMS: 5_000,
        maxIdleTimeMS: 120_000,
        maxPoolSize: MAX_POOL_SIZE,
        minPoolSize: MIN_POOL_SIZE,
        family: 4,
        retryReads: true,
        retryWrites: true,
        heartbeatFrequencyMS: 10_000,
      })
    } catch (error) {
      lastError = error
      if (attempt < MAX_CONNECT_ATTEMPTS) await delay(attempt === 1 ? 350 : 1_000)
    }
  }

  throw lastError
}

export async function getDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI manquant — définis-le dans web/.env.local')
  }

  if (!cache.promise) {
    cache.promise = connectWithRetry(MONGODB_URI)
  }

  try {
    cache.conn = await cache.promise
    if (process.env.MONGODB_ENSURE_INDEXES === '1' && !indexesInitialized) {
      indexesInitializing ??= ensureIndexes().finally(() => {
        indexesInitialized = true
        indexesInitializing = null
      })
      await indexesInitializing
    }
  } catch (err) {
    cache.promise = null
    throw err
  }

  return cache.conn
}

async function ensureIndexes() {
  await Promise.all([
    OrganizerProfile.init(),
    ProviderProfile.init(),
    Event.init(),
    Conversation.init(),
    Message.init(),
    User.init(),
    Order.init(),
    Ticket.init(),
    EventInterest.init(),
    OrganizerFollow.init(),
    Application.init(),
    FriendRequest.init(),
    Notification.init(),
    Report.init(),
    EventOrder.init(),
    SeatHold.init(),
    RateLimit.init(),
    RefundCase.init(),
    RefundPoint.init(),
    VercelDrainEvent.init(),
    VercelSpendEvent.init(),
    VercelPlatformEvent.init(),
    VercelOpsConfigChange.init(),
  ])
}
