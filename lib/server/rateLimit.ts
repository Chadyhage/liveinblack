import crypto from 'node:crypto'
import { getDb } from '../db/mongoose'
import RateLimit from '../models/RateLimit'

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
  return req.headers.get('x-real-ip')?.trim() || forwarded || 'unknown'
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  await getDb()
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
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  return {
    allowed: Boolean(entry && entry.count <= options.limit),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
  }
}
