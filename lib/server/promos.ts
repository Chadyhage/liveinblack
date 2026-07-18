// Port TypeScript de lib/promos.js (legacy Firestore array-doc) vers Mongoose
// (un document par code — voir lib/models/PromoCode.ts). Logique de calcul
// inchangée à l'identique ; seule la lecture/écriture change (requête directe
// + $inc atomique au lieu d'une transaction sur un tableau).
import type { PromoCodeModel, PromoCodeDoc } from '../models/PromoCode'

export type Promo = PromoCodeDoc

export type ResolvePromoResult =
  | { ok: true; promo: Promo }
  | { ok: false; reason: string; message: string }

export function normalizePromoCode(raw: unknown): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
}

export async function resolvePromo(
  PromoCode: PromoCodeModel,
  eventId: string,
  rawCode: unknown,
  requestedUses = 1
): Promise<ResolvePromoResult> {
  const code = normalizePromoCode(rawCode)
  if (!code) return { ok: false, reason: 'empty', message: 'Saisis un code promo.' }

  const promo = await PromoCode.findOne({ eventId: String(eventId), code }).lean<Promo>()
  if (!promo) return { ok: false, reason: 'unknown', message: "Ce code promo n'existe pas pour cet événement." }
  if (promo.active === false) return { ok: false, reason: 'inactive', message: "Ce code promo n'est plus actif." }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', message: 'Ce code promo a expiré.' }
  }

  const maxUses = Math.max(0, Number(promo.maxUses) || 0)
  if (maxUses > 0) {
    const used = Math.max(0, Number(promo.usedCount) || 0)
    const remaining = maxUses - used
    if (remaining <= 0) {
      return { ok: false, reason: 'exhausted', message: "Ce code promo a atteint sa limite d'utilisations." }
    }
    // Plafonnement PAR QUANTITÉ (#69) : une seule commande ne peut pas
    // consommer plus que les utilisations restantes.
    const uses = Math.max(1, Math.floor(Number(requestedUses) || 1))
    if (uses > remaining) {
      return {
        ok: false,
        reason: 'insufficient_uses',
        message:
          remaining === 1
            ? "Il ne reste qu'une seule utilisation pour ce code — commande 1 billet avec ce code."
            : `Il ne reste que ${remaining} utilisations pour ce code — réduis la quantité.`,
      }
    }
  }

  return { ok: true, promo: { ...promo, code } }
}

// Réduction PAR BILLET dans la plus petite unité de la devise.
// minorPerMajor : 100 pour EUR (centimes), 1 pour XOF (pas de centimes).
export function promoUnitDiscount(promo: Promo | null, unitSmallest: number, minorPerMajor: number): number {
  const unit = Math.max(0, Math.round(Number(unitSmallest) || 0))
  if (!promo || unit <= 0) return 0
  if (promo.type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(promo.value) || 0))
    return Math.min(unit, Math.round((unit * pct) / 100))
  }
  const fixed = Math.max(0, Math.round((Number(promo.value) || 0) * minorPerMajor))
  return Math.min(unit, fixed)
}

export function promoLabel(promo: Promo | null, currency = 'EUR'): string {
  if (!promo) return ''
  if (promo.type === 'percent') return `-${Math.round(Number(promo.value) || 0)} %`
  const cur = String(currency).toUpperCase() === 'XOF' ? 'FCFA' : '€'
  return `-${Math.round(Number(promo.value) || 0)} ${cur}`
}

// Incrémente le compteur d'utilisations — appelé par les webhooks APRÈS le
// premier settlement uniquement (le flag `settled` du ticket garantit
// l'exactly-once ; le $inc protège seulement contre les écritures concurrentes
// d'AUTRES commandes sur le même code).
export async function registerPromoUse(
  PromoCode: PromoCodeModel,
  eventId: string,
  rawCode: unknown,
  uses = 1
): Promise<void> {
  const code = normalizePromoCode(rawCode)
  if (!code || !eventId) return
  try {
    await PromoCode.updateOne(
      { eventId: String(eventId), code },
      { $inc: { usedCount: Math.max(1, Number(uses) || 1) } }
    )
  } catch (e) {
    console.error('[promos] registerPromoUse failed:', eventId, code, (e as Error).message)
  }
}
