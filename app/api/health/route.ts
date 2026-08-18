import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'

const DEPS_TIMEOUT_MS = 2500
const HEALTH_CACHE_TTL_MS = 5000

type MongoCheckResult = 'ok' | 'degraded' | 'not_configured'
let mongoCache: { at: number; value: MongoCheckResult } = {
  at: 0,
  value: 'not_configured',
}

async function getMongoStatus(): Promise<MongoCheckResult> {
  const now = Date.now()
  if (mongoCache.at > 0 && now - mongoCache.at < HEALTH_CACHE_TTL_MS) {
    return mongoCache.value
  }

  if (!process.env.MONGODB_URI) {
    mongoCache = { at: now, value: 'not_configured' }
    return 'not_configured'
  }

  try {
    const db = await getDb()
    const admin = db.connection.db?.admin()
    if (!admin) throw new Error('mongo_admin_missing')
    await timeout(admin.ping(), DEPS_TIMEOUT_MS)
    mongoCache = { at: now, value: 'ok' }
    return 'ok'
  } catch {
    mongoCache = { at: now, value: 'degraded' }
    return 'degraded'
  }
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms)
    }),
  ])
}

export async function GET() {
  const startedAt = Date.now()
  const isProduction = process.env.NODE_ENV === 'production'

  const mongo = await getMongoStatus()

  const checks = {
    app: 'ok',
    mongo,
    stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET ? 'ok' : 'not_configured',
    fedapayWebhook: process.env.FEDAPAY_WEBHOOK_SECRET ? 'ok' : 'not_configured',
  }

  const isHealthy = checks.app === 'ok' && (checks.mongo === 'ok' || (!isProduction && checks.mongo === 'not_configured'))
  const durationMs = Date.now() - startedAt

  return NextResponse.json(
    { ok: isHealthy, checks, durationMs, timestamp: new Date().toISOString() },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  )
}

export const dynamic = 'force-dynamic'
