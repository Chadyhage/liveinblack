import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import PromoCode, { type PromoCodeDoc } from '../models/PromoCode'
import { normalizePromoCode } from './promos'

// Port de src/components/PromoCodesPanel.jsx (#7 phase organisateur) — côté
// organisateur uniquement (création/activation/suppression) ; la
// consommation à l'achat reste dans lib/server/promos.ts (resolvePromo/
// registerPromoUse), jamais dupliquée ici. Contrairement au legacy (un seul
// document Firestore `event_promos/{eventId} = {items:[...]}`, avec une
// gymnastique "insertOnly" pour ne jamais écraser `usedCount` sous une
// écriture concurrente), le modèle Mongo à un document par code
// (PromoCode.ts, index unique {eventId,code}) rend cette gymnastique inutile
// — un simple `create()` échoue proprement (duplicate key) en cas de course.

export interface PromoCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

async function assertOwner(eventId: string, callerId: string) {
  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false as const, status: 403, error: 'forbidden' }
  return { ok: true as const, event }
}

export interface PromoCodeView {
  code: string
  type: 'percent' | 'fixed'
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt: string | null
  createdAt: string
}

function toView(p: PromoCodeDoc): PromoCodeView {
  return {
    code: p.code,
    type: p.type as 'percent' | 'fixed',
    value: p.value,
    maxUses: p.maxUses ?? 0,
    usedCount: p.usedCount ?? 0,
    active: p.active ?? true,
    expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
  }
}

export interface CreatePromoInput {
  code: string
  type: 'percent' | 'fixed'
  value: number
  maxUses?: number
  expiresAt?: string | null
}

export type CreatePromoResult = ErrResult | { ok: true; promo: PromoCodeView }

export async function createPromoCode(caller: PromoCaller, eventId: string, input: CreatePromoInput): Promise<CreatePromoResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const code = normalizePromoCode(input.code)
  if (code.length < 3) return { ok: false, status: 400, error: 'code_too_short' }

  const value = Number(input.value)
  if (!Number.isFinite(value) || value <= 0) return { ok: false, status: 400, error: 'invalid_value' }

  if (input.type === 'percent') {
    // Max 99 % — un code à 100% reviendrait à offrir la place, ce qui doit
    // passer par la guestlist (billets gratuits), jamais par un code promo.
    if (value >= 100) return { ok: false, status: 400, error: 'percent_too_high' }
  } else {
    const prices = (guard.event.places || []).map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0)
    const minPrice = prices.length ? Math.min(...prices) : 0
    if (minPrice > 0 && value >= minPrice) return { ok: false, status: 400, error: 'fixed_covers_cheapest_ticket' }
  }

  const maxUses = Math.max(0, Math.floor(Number(input.maxUses) || 0))
  const expiresAt = input.expiresAt ? new Date(`${input.expiresAt}T23:59:59`) : null

  try {
    const promo = await PromoCode.create({ eventId, code, type: input.type, value, maxUses, active: true, expiresAt, createdBy: caller.id })
    return { ok: true, promo: toView(promo.toObject()) }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return { ok: false, status: 409, error: 'code_taken' }
    }
    throw err
  }
}

export type ListPromoResult = ErrResult | { ok: true; promos: PromoCodeView[] }

export async function listPromoCodes(caller: PromoCaller, eventId: string): Promise<ListPromoResult> {
  await getDb()
  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const promos = await PromoCode.find({ eventId }).sort({ createdAt: -1 }).lean()
  return { ok: true, promos: promos.map(toView) }
}

export type ToggleResult = ErrResult | { ok: true; active: boolean }

export async function togglePromoCodeActive(caller: PromoCaller, eventId: string, code: string): Promise<ToggleResult> {
  await getDb()
  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const normalized = normalizePromoCode(code)
  const promo = await PromoCode.findOne({ eventId, code: normalized })
  if (!promo) return { ok: false, status: 404, error: 'promo_not_found' }

  promo.active = !promo.active
  await promo.save()
  return { ok: true, active: promo.active as boolean }
}

export type DeletePromoResult = ErrResult | { ok: true }

// Suppression immédiate, SANS confirmation — fidèle au legacy (contrairement
// au retrait d'un membre d'équipe, toujours confirmé), voir le research.
export async function deletePromoCode(caller: PromoCaller, eventId: string, code: string): Promise<DeletePromoResult> {
  await getDb()
  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const normalized = normalizePromoCode(code)
  await PromoCode.deleteOne({ eventId, code: normalized })
  return { ok: true }
}
