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

// Ajouté suite à l'audit de scalabilité du 12/08/2026 : contrairement à
// l'authentification/l'inscription/le contact, aucune route de checkout
// (POST /api/checkout, .../fedapay, .../free, .../boost, .../resale,
// .../seat-hold, et leurs variantes fedapay) n'avait de rate limiting —
// exposées à l'abus par bot à volume élevé (spam de tentatives d'achat,
// génération artificielle de sessions Stripe/FedaPay). Un seul helper
// partagé plutôt que dupliquer scope/limit/window dans 8 fichiers (l'audit
// lui-même signale ce risque de divergence de copies). Par UTILISATEUR
// (jamais par IP) : ces routes sont toutes authentifiées, et une limite par
// IP pénaliserait à tort plusieurs comptes légitimes derrière la même IP
// (NAT, réseau d'entreprise/campus). Plafond généreux — un utilisateur peut
// légitimement retenter plusieurs fois si un paiement échoue.
export async function checkCheckoutRateLimit(callerId: string): Promise<RateLimitResult> {
  return checkRateLimit({ scope: 'checkout-user', identifier: callerId, limit: 30, windowMs: 10 * 60 * 1000 })
}
