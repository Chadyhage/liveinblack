import crypto from 'node:crypto'
import { getDb } from '@/lib/db/mongoose'
import RateLimit from '@/lib/models/RateLimit'

export interface RateLimitOptions {
  scope: string
  identifier: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function getRequestIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = req.headers.get('x-real-ip')?.trim()

  const ip = realIp || forwarded
  if (ip) return ip

  const userAgent = req.headers.get('user-agent') ?? ''
  const uaDigest = crypto
    .createHash('sha256')
    .update(userAgent || 'unknown-user-agent')
    .digest('hex')
    .slice(0, 16)

  return `ua-${uaDigest}`
}

type MemoryRateLimitEntry = {
  count: number
  expiresAt: number
}

const memoryBuckets = new Map<string, MemoryRateLimitEntry>()

async function checkRateLimitMemory(scope: string, identifier: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now()
  const bucketStart = Math.floor(now / windowMs) * windowMs
  const key = crypto
    .createHash('sha256')
    .update(`${scope}:${bucketStart}:${identifier.trim().toLowerCase()}`)
    .digest('hex')

  const expiresAt = bucketStart + windowMs
  const existing = memoryBuckets.get(key)

  if (!existing || existing.expiresAt <= now) {
    memoryBuckets.set(key, { count: 1, expiresAt })
    return {
      allowed: 1 <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    allowed: existing.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  }
}

async function cleanupMemoryBuckets() {
  const now = Date.now()
  for (const [key, value] of memoryBuckets.entries()) {
    if (value.expiresAt <= now) {
      memoryBuckets.delete(key)
    }
  }
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    await getDb()
  } catch {
    await cleanupMemoryBuckets()
    return checkRateLimitMemory(options.scope, options.identifier, options.limit, options.windowMs)
  }

  const now = Date.now()
  const bucketStart = Math.floor(now / options.windowMs) * options.windowMs
  const key = crypto
    .createHash('sha256')
    .update(`${options.scope}:${bucketStart}:${options.identifier.trim().toLowerCase()}`)
    .digest('hex')
  const expiresAt = new Date(bucketStart + options.windowMs)

  const entry = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean()

  return {
    allowed: Boolean(entry && entry.count <= options.limit),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
  }
}
