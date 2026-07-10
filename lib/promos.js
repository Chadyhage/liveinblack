// ─── Codes promo (serveur) ────────────────────────────────────────────────────
// Source unique de la logique promo, partagée par api/checkout.js (Stripe/EUR),
// api/fedapay.js (XOF) et api/event-stock.js (validation UX).
//
// Stockage : event_promos/{eventId} = { items: [{ code, type, value, maxUses,
// usedCount, expiresAt, active, createdAt }] } — écrit par l'ORGANISATEUR
// (règles Firestore), JAMAIS lisible par les acheteurs : le client ne voit un
// code que s'il le connaît déjà (validation serveur), comme sur Shotgun.
//
// Modèle de réduction : PAR BILLET (percent = % du prix du billet ; fixed =
// montant retranché du prix du billet, en devise de l'événement). Pour une
// table entière (1 unité payée au prix plein), la réduction s'applique une
// fois au prix de la table.
//
// Compteur d'utilisations : 1 billet vendu = 1 utilisation (une table = 1).
// L'incrément se fait dans les webhooks au PREMIER settlement (exactly-once,
// gardé par le flag `settled`) — jamais à la création de session, sinon un
// panier abandonné consommerait le code.

export function normalizePromoCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
}

// Résout un code sur un événement. → { ok:true, promo } | { ok:false, reason, message }
export async function resolvePromo(db, eventId, rawCode) {
  const code = normalizePromoCode(rawCode)
  if (!code) return { ok: false, reason: 'empty', message: 'Saisis un code promo.' }
  const snap = await db.collection('event_promos').doc(String(eventId)).get()
  const items = snap.exists && Array.isArray(snap.data().items) ? snap.data().items : []
  const promo = items.find(p => normalizePromoCode(p.code) === code) || null
  if (!promo) return { ok: false, reason: 'unknown', message: 'Ce code promo n\'existe pas pour cet événement.' }
  if (promo.active === false) return { ok: false, reason: 'inactive', message: 'Ce code promo n\'est plus actif.' }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', message: 'Ce code promo a expiré.' }
  }
  const maxUses = Math.max(0, Number(promo.maxUses) || 0)
  if (maxUses > 0 && (Number(promo.usedCount) || 0) >= maxUses) {
    return { ok: false, reason: 'exhausted', message: 'Ce code promo a atteint sa limite d\'utilisations.' }
  }
  return { ok: true, promo: { ...promo, code } }
}

// Réduction PAR BILLET dans la plus petite unité de la devise.
// minorPerMajor : 100 pour EUR (centimes), 1 pour XOF (pas de centimes).
export function promoUnitDiscount(promo, unitSmallest, minorPerMajor) {
  const unit = Math.max(0, Math.round(Number(unitSmallest) || 0))
  if (!promo || unit <= 0) return 0
  if (promo.type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(promo.value) || 0))
    return Math.min(unit, Math.round(unit * pct / 100))
  }
  const fixed = Math.max(0, Math.round((Number(promo.value) || 0) * minorPerMajor))
  return Math.min(unit, fixed)
}

// Libellé humain de la réduction (affichage récap / Stripe).
export function promoLabel(promo, currency = 'EUR') {
  if (!promo) return ''
  if (promo.type === 'percent') return `-${Math.round(Number(promo.value) || 0)} %`
  const cur = String(currency).toUpperCase() === 'XOF' ? 'FCFA' : '€'
  return `-${Math.round(Number(promo.value) || 0)} ${cur}`
}

// Incrémente le compteur d'utilisations d'un code — appelé par les webhooks
// APRÈS le premier settlement uniquement (le flag `settled` garantit
// l'exactly-once ; cette transaction protège seulement contre les écritures
// concurrentes d'AUTRES commandes sur le même doc).
export async function registerPromoUse(db, eventId, rawCode, uses = 1) {
  const code = normalizePromoCode(rawCode)
  if (!code || !eventId) return
  const ref = db.collection('event_promos').doc(String(eventId))
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) return
      const items = Array.isArray(snap.data().items) ? snap.data().items : []
      const next = items.map(p => normalizePromoCode(p.code) === code
        ? { ...p, usedCount: (Number(p.usedCount) || 0) + Math.max(1, Number(uses) || 1) }
        : p)
      tx.set(ref, { items: next, updatedAt: Date.now() }, { merge: true })
    })
  } catch (e) {
    console.error('[promos] registerPromoUse failed:', eventId, code, e.message)
  }
}
