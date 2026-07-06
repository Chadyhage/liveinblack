// Client API FedaPay (mobile money Togo/Bénin — Mixx by Yas, Moov, MTN…).
// REST pur via fetch (pas de dépendance npm) — l'API est simple et stable.
//
// Env requis (Vercel + .env.local) :
//   FEDAPAY_SECRET_KEY      sk_sandbox_xxx (test) ou sk_live_xxx (prod)
//   FEDAPAY_WEBHOOK_SECRET  wh_sandbox_xxx / wh_live_xxx (Dashboard → Workbench → Webhooks)
//
// La base URL est déduite de la clé : sk_sandbox_* → sandbox-api.fedapay.com.
// Doc : https://docs.fedapay.com (transactions, payouts, webhooks).

import crypto from 'crypto'

function apiBase() {
  const key = process.env.FEDAPAY_SECRET_KEY || ''
  if (process.env.FEDAPAY_API_BASE) return process.env.FEDAPAY_API_BASE
  return key.includes('sandbox')
    ? 'https://sandbox-api.fedapay.com/v1'
    : 'https://api.fedapay.com/v1'
}

export function isFedapayConfigured() {
  return !!process.env.FEDAPAY_SECRET_KEY
}

// transaction.updated peut porter la confirmation finale du paiement.
export function isApprovedTransactionEvent(name, entity) {
  return name === 'transaction.approved'
    || (name === 'transaction.updated' && entity?.status === 'approved')
}

export function transactionAmountMatches(paidAmount, expectedAmount) {
  const paid = Math.round(Number(paidAmount) || 0)
  const expected = Math.round(Number(expectedAmount) || 0)
  return expected > 0 && paid === expected
}

// Requête générique — jette une Error avec le message FedaPay en cas d'échec.
async function fdRequest(method, path, body) {
  const key = process.env.FEDAPAY_SECRET_KEY
  if (!key) throw new Error('FEDAPAY_SECRET_KEY manquante (env Vercel)')
  const resp = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let data = null
  try { data = await resp.json() } catch { /* réponse vide */ }
  if (!resp.ok) {
    const msg = data?.message || data?.errors && JSON.stringify(data.errors) || `FedaPay ${resp.status}`
    const err = new Error(msg)
    err.status = resp.status
    err.fedapay = data
    throw err
  }
  return data
}

// ── Transactions (collectes) ──────────────────────────────────────────────────

// Crée une transaction. amount = FCFA ENTIERS. Renvoie l'objet transaction (v1/transaction).
// customer est optionnel — si FedaPay rejette le customer (email déjà lié à un
// autre client chez eux), on retente SANS customer : la page de paiement le
// collectera elle-même. L'encaissement ne doit jamais échouer pour ça.
export async function createTransaction({ description, amount, callbackUrl, customer, metadata, reference }) {
  const payload = {
    description: String(description || 'LIVEINBLACK').slice(0, 255),
    amount: Math.round(Number(amount) || 0),
    currency: { iso: 'XOF' },
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(metadata ? { custom_metadata: metadata } : {}),
    ...(reference ? { merchant_reference: String(reference).slice(0, 100) } : {}),
  }
  try {
    const data = await fdRequest('POST', '/transactions', { ...payload, ...(customer ? { customer } : {}) })
    return data?.['v1/transaction'] || data?.transaction || data
  } catch (e) {
    if (customer) {
      console.warn('[fedapay] création avec customer refusée, retry sans customer:', e.message)
      const data = await fdRequest('POST', '/transactions', payload)
      return data?.['v1/transaction'] || data?.transaction || data
    }
    throw e
  }
}

// Génère le lien de paiement hébergé d'une transaction → { token, url }.
export async function createToken(transactionId) {
  const data = await fdRequest('POST', `/transactions/${transactionId}/token`)
  return { token: data?.token || null, url: data?.url || null }
}

// Récupère une transaction (statut : pending/approved/declined/canceled/expired/refunded/transferred).
export async function getTransaction(transactionId) {
  const data = await fdRequest('GET', `/transactions/${transactionId}`)
  return data?.['v1/transaction'] || data?.transaction || data
}

// ── Payouts (dépôts vers mobile money — reversements organisateurs) ──────────

// Crée un dépôt vers le mobile money d'un destinataire. amount = FCFA entiers.
// mode = réseau ('mtn_open', 'moov', 'moov_tg', 'togocel'…) selon l'opérateur.
export async function createPayout({ amount, description, customer, metadata, reference }) {
  const payload = {
    amount: Math.round(Number(amount) || 0),
    currency: { iso: 'XOF' },
    ...(description ? { description: String(description).slice(0, 255) } : {}),
    ...(customer ? { customer } : {}),
    ...(metadata ? { custom_metadata: metadata } : {}),
    ...(reference ? { merchant_reference: String(reference).slice(0, 100) } : {}),
  }
  const data = await fdRequest('POST', '/payouts', payload)
  return data?.['v1/payout'] || data?.payout || data
}

// Lance l'envoi immédiat d'un payout créé (statut pending → started).
export async function startPayout(payoutId, phoneNumber) {
  const data = await fdRequest('PUT', '/payouts/start', {
    payouts: [{ id: payoutId, ...(phoneNumber ? { phone_number: phoneNumber } : {}) }],
  })
  return data
}

// ── Webhook — vérification de signature ──────────────────────────────────────
// Schéma identique à Stripe : header `x-fedapay-signature` = "t=<unix>,s=<hmac>"
// où hmac = HMAC-SHA256 hex de `${t}.${rawBody}` avec le secret wh_*.
// (Source : SDK officiel fedapay-node, src/Webhook.ts.)
const SIGNATURE_TOLERANCE_S = 300 // 5 min — anti-replay

export function verifyWebhookSignature(rawBody, header, secret) {
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')
  const parts = String(header || '').split(',')
  let timestamp = -1
  const signatures = []
  for (const item of parts) {
    const [k, v] = item.split('=')
    if (k === 't') timestamp = parseInt(v, 10)
    if (k === 's' && v) signatures.push(v)
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) return false

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const match = signatures.some(sig => {
    const sigBuf = Buffer.from(String(sig), 'utf8')
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  })
  if (!match) return false

  const age = Math.floor(Date.now() / 1000) - timestamp
  if (age > SIGNATURE_TOLERANCE_S) return false
  return true
}
