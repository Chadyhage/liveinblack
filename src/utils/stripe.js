// src/utils/stripe.js — Helper frontend pour Stripe Checkout

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
      headers: { 'Content-Type': 'application/json' },
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
 * Vérifie le statut d'une session Stripe après redirect success.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function verifyStripeSession(sessionId) {
  try {
    const res = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
