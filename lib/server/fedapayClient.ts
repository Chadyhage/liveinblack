// Port TypeScript de lib/fedapay.js — client REST FedaPay (mobile money
// Togo/Bénin/UEMOA). Pas de SDK npm, fetch pur — l'API est simple et stable.
import crypto from 'node:crypto'

function apiBase(): string {
  const key = process.env.FEDAPAY_SECRET_KEY || ''
  if (process.env.FEDAPAY_API_BASE) return process.env.FEDAPAY_API_BASE
  return key.includes('sandbox') ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1'
}

export function isFedapayConfigured(): boolean {
  return Boolean(process.env.FEDAPAY_SECRET_KEY)
}

export function isApprovedTransactionEvent(name: string, entity: { status?: string } | null | undefined): boolean {
  return name === 'transaction.approved' || (name === 'transaction.updated' && entity?.status === 'approved')
}

export function transactionAmountMatches(paidAmount: unknown, expectedAmount: unknown): boolean {
  const paid = Math.round(Number(paidAmount) || 0)
  const expected = Math.round(Number(expectedAmount) || 0)
  return expected > 0 && paid === expected
}

class FedapayError extends Error {
  status?: number
  fedapay?: unknown
}

async function fdRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.FEDAPAY_SECRET_KEY
  if (!key) throw new Error('FEDAPAY_SECRET_KEY manquante')
  const resp = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let data: Record<string, unknown> | null = null
  try {
    data = await resp.json()
  } catch {
    // réponse vide
  }
  if (!resp.ok) {
    const msg = (data?.message as string) || (data?.errors ? JSON.stringify(data.errors) : `FedaPay ${resp.status}`)
    const err = new FedapayError(msg)
    err.status = resp.status
    err.fedapay = data
    throw err
  }
  return data as T
}

export type FedapayTransaction = {
  id: number | string
  status: string
  amount: number
  [key: string]: unknown
}

export async function createTransaction({
  description,
  amount,
  callbackUrl,
  customer,
  metadata,
  reference,
}: {
  description: string
  amount: number
  callbackUrl?: string
  customer?: { email: string; firstname?: string } | null
  metadata?: Record<string, string>
  reference?: string
}): Promise<FedapayTransaction> {
  const payload = {
    description: String(description || 'LIVEINBLACK').slice(0, 255),
    amount: Math.round(Number(amount) || 0),
    currency: { iso: 'XOF' },
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(metadata ? { custom_metadata: metadata } : {}),
    ...(reference ? { merchant_reference: String(reference).slice(0, 100) } : {}),
  }
  try {
    const data = await fdRequest<Record<string, unknown>>('POST', '/transactions', { ...payload, ...(customer ? { customer } : {}) })
    return (data?.['v1/transaction'] || data?.transaction || data) as FedapayTransaction
  } catch (e) {
    if (customer) {
      console.warn('[fedapay] création avec customer refusée, retry sans customer:', (e as Error).message)
      const data = await fdRequest<Record<string, unknown>>('POST', '/transactions', payload)
      return (data?.['v1/transaction'] || data?.transaction || data) as FedapayTransaction
    }
    throw e
  }
}

export async function createToken(transactionId: number | string): Promise<{ token: string | null; url: string | null }> {
  const data = await fdRequest<{ token?: string; url?: string }>('POST', `/transactions/${transactionId}/token`)
  return { token: data?.token || null, url: data?.url || null }
}

export async function getTransaction(transactionId: number | string): Promise<FedapayTransaction> {
  const data = await fdRequest<Record<string, unknown>>('GET', `/transactions/${transactionId}`)
  return (data?.['v1/transaction'] || data?.transaction || data) as FedapayTransaction
}

export type FedapayPayout = { id: number | string; status: string; [key: string]: unknown }

export async function createPayout({
  amount,
  description,
  customer,
  metadata,
  reference,
}: {
  amount: number
  description?: string
  customer?: { firstname?: string; lastname?: string; phone_number?: { number: string; country: string } }
  metadata?: Record<string, string>
  reference?: string
}): Promise<FedapayPayout> {
  const payload = {
    amount: Math.round(Number(amount) || 0),
    currency: { iso: 'XOF' },
    ...(description ? { description: String(description).slice(0, 255) } : {}),
    ...(customer ? { customer } : {}),
    ...(metadata ? { custom_metadata: metadata } : {}),
    ...(reference ? { merchant_reference: String(reference).slice(0, 100) } : {}),
  }
  const data = await fdRequest<Record<string, unknown>>('POST', '/payouts', payload)
  return (data?.['v1/payout'] || data?.payout || data) as FedapayPayout
}

export async function startPayout(payoutId: number | string, phoneNumber?: { number: string; country: string }): Promise<unknown> {
  return fdRequest('PUT', '/payouts/start', { payouts: [{ id: payoutId, ...(phoneNumber ? { phone_number: phoneNumber } : {}) }] })
}

export async function getPayout(payoutId: number | string): Promise<FedapayPayout> {
  const data = await fdRequest<Record<string, unknown>>('GET', `/payouts/${payoutId}`)
  return (data?.['v1/payout'] || data?.payout || data) as FedapayPayout
}

// ── Webhook — vérification de signature (même schéma que Stripe) ──
const SIGNATURE_TOLERANCE_S = 300 // 5 min — anti-replay

export function verifyWebhookSignature(rawBody: string | Buffer, header: string | null | undefined, secret: string): boolean {
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')
  const parts = String(header || '').split(',')
  let timestamp = -1
  const signatures: string[] = []
  for (const item of parts) {
    const [k, v] = item.split('=')
    if (k === 't') timestamp = parseInt(v, 10)
    if (k === 's' && v) signatures.push(v)
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) return false

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const match = signatures.some((sig) => {
    const sigBuf = Buffer.from(String(sig), 'utf8')
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  })
  if (!match) return false

  const age = Math.floor(Date.now() / 1000) - timestamp
  return age <= SIGNATURE_TOLERANCE_S
}
