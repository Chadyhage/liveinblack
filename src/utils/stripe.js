// src/utils/stripe.js — Helpers frontend paiement (Stripe Checkout + FedaPay)
// Tous les endpoints /api exigent désormais un ID token Firebase (audit n°3) :
// authHeaders() le joint automatiquement (vide si non connecté → 401 propre).
//
// Routage devise : EUR → Stripe (/api/checkout), XOF → FedaPay (/api/fedapay,
// mobile money Togo/Bénin). Les pages appellent startTicketCheckout(params)
// avec params.currency — le bon tunnel est choisi ici.
import { authHeaders } from './apiAuth'

/**
 * Lance le paiement d'un billet — route vers Stripe (EUR) ou FedaPay (XOF).
 * Mêmes params que startStripeCheckout + { currency, userName? } ;
 * pour XOF, unitPriceEUR est interprété comme le prix en FCFA (entier).
 */
export async function startTicketCheckout(params) {
  if (String(params?.currency || '').toUpperCase() === 'XOF') {
    return startFedapayCheckout(params)
  }
  return startStripeCheckout(params)
}

/**
 * Lance un paiement FedaPay (page hébergée mobile money / carte, en FCFA).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function startFedapayCheckout(params) {
  try {
    const res = await fetch('/api/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        action: 'checkout',
        eventId: params.eventId,
        eventName: params.eventName,
        placeType: params.placeType,
        qty: params.qty,
        // Le serveur relit le prix de la place dans Firestore — cette valeur
        // ne sert que pour les parts de groupe (fraction du total).
        unitPrice: Math.round(Number(params.unitPriceEUR) || 0),
        preorderItems: (params.preorderItems || []).map(it => ({
          name: it.name, qty: it.qty, price: Math.round(Number(it.priceEUR ?? it.price) || 0),
        })),
        userId: params.userId,
        userEmail: params.userEmail,
        userName: params.userName,
        bookingId: params.bookingId,
        ...(params.groupBookingId ? { groupBookingId: params.groupBookingId } : {}),
        ...(params.isGroupShare ? { isGroupShare: true } : {}),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }
    const data = await res.json()
    if (!data.url) return { ok: false, error: 'Lien de paiement manquant' }
    window.location.href = data.url
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur réseau' }
  }
}

/**
 * Vérifie une transaction FedaPay après retour (?id=...&status=... sur
 * /paiement-reussi). Réponse alignée sur verifyStripeSession :
 * { paid, paymentStatus, amountTotal (FCFA), currency:'xof', metadata } | null
 */
export async function verifyFedapayTransaction(transactionId) {
  try {
    const res = await fetch(`/api/fedapay?id=${encodeURIComponent(transactionId)}`, {
      headers: { ...(await authHeaders()) },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Demande le restock d'une transaction FedaPay annulée/refusée (le serveur
 * re-vérifie le statut chez FedaPay — idempotent, jamais de double restock).
 */
export async function releaseFedapayTransaction(transactionId) {
  try {
    await fetch('/api/fedapay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action: 'release', transactionId }),
    })
  } catch { /* best-effort — le webhook FedaPay couvre ce cas */ }
}

/**
 * Lance un Stripe Checkout pour une réservation d'événement.
 *
 * @param {Object} params
 * @param {string} params.eventId
 * @param {string} params.eventName
 * @param {string} [params.eventImage]
 * @param {string} params.placeType
 * @param {number} params.qty
 * @param {number} params.unitPriceEUR
 * @param {Array}  [params.preorderItems]
 * @param {string} params.userId
 * @param {string} [params.userEmail]
 * @param {string} params.bookingId  - id local généré pour rapprocher booking ↔ paiement
 *
 * Redirige le navigateur vers Stripe en cas de succès.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function startStripeCheckout(params) {
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }

    const data = await res.json()
    if (!data.url) return { ok: false, error: 'URL Stripe manquante' }

    // Redirige le navigateur vers Stripe Checkout
    window.location.href = data.url
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur réseau' }
  }
}

/**
 * Lance un Stripe Checkout pour booster un événement (Top 1/2/3).
 *
 * @param {Object} params - { eventId, eventName, position, days, priceEUR, region, userId, userEmail, boostId }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function startStripeBoostCheckout(params) {
  try {
    const res = await fetch('/api/checkout-boost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }
    const data = await res.json()
    if (!data.url) return { ok: false, error: 'URL Stripe manquante' }
    window.location.href = data.url
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur réseau' }
  }
}

/**
 * Vérifie le statut d'une session Stripe après redirect success.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function verifyStripeSession(sessionId) {
  try {
    // Fusionné dans /api/checkout (GET) — l'endpoint /api/verify-session n'existe plus.
    const res = await fetch(`/api/checkout?session_id=${encodeURIComponent(sessionId)}`, {
      headers: { ...(await authHeaders()) },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
