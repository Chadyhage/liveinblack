import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'
import Stripe from 'stripe'

const TIMEOUT_MS = 10_000

function withTimeout(work) {
  return Promise.race([
    work,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ])
}

const checks = [
  ['MongoDB', async () => {
    if (!process.env.MONGODB_URI) throw new Error('missing')
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8_000 })
    try {
      await client.connect()
      await client.db().command({ ping: 1 })
    } finally {
      await client.close()
    }
  }],
  ['Stripe', async () => {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('missing')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 8_000, maxNetworkRetries: 0 })
    await stripe.balance.retrieve()
  }],
  ['Cloudinary', async () => {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new Error('missing')
    cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET })
    await cloudinary.api.ping()
  }],
  ['Resend', async () => {
    if (!process.env.RESEND_API_KEY) throw new Error('missing')
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error('unavailable')
  }],
  ['FedaPay', async () => {
    const key = process.env.FEDAPAY_SECRET_KEY || ''
    if (!key) throw new Error('missing')
    const base = key.includes('sandbox') ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1'
    const response = await fetch(`${base}/transactions?per_page=1`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error('unavailable')
  }],
]

let failed = false
const results = await Promise.all(
  checks.map(async ([name, check]) => {
    const started = Date.now()
    try {
      await withTimeout(check())
      return { name, ok: true, ms: Date.now() - started }
    } catch (error) {
      failed = true
      const reason = error instanceof Error && error.message === 'missing'
        ? 'configuration absente'
        : 'connexion ou authentification refusée'
      return { name, ok: false, reason, ms: Date.now() - started }
    }
  })
)

for (const item of results) {
  if (item.ok) {
    console.log(`${item.name}: opérationnel (${item.ms}ms)`)
  } else {
    console.log(`${item.name}: échec — ${item.reason} (${item.ms}ms)`)
  }
}

process.exitCode = failed ? 1 : 0
