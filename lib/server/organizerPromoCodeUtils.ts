import type { PromoCodeDoc } from '../models/PromoCode'

export interface PromoCodeView {
  code: string
  type: 'percent' | 'fixed'
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt: string | null
  createdAt: string
  placeIds?: string[]
}

export function toPromoCodeView(promo: PromoCodeDoc): PromoCodeView {
  return {
    code: promo.code,
    type: promo.type as 'percent' | 'fixed',
    value: promo.value,
    maxUses: promo.maxUses ?? 0,
    usedCount: promo.usedCount ?? 0,
    active: promo.active ?? true,
    expiresAt: promo.expiresAt ? new Date(promo.expiresAt).toISOString() : null,
    createdAt: promo.createdAt ? new Date(promo.createdAt).toISOString() : '',
    placeIds: promo.placeIds && promo.placeIds.length > 0 ? (promo.placeIds as string[]) : undefined,
  }
}

export function normalizePromoPlaceIds(placeIds: string[] | undefined | null): string[] {
  return (placeIds || []).map((id) => id.trim()).filter(Boolean)
}

export function hasOnlyKnownPromoPlaceIds(eventPlaceIds: Set<string>, placeIds: string[]): boolean {
  return placeIds.length === 0 || placeIds.every((id) => eventPlaceIds.has(id))
}

export function scopedPromoPlaces<T extends { id: string }>(places: T[], placeIds: string[]): T[] {
  return placeIds.length > 0 ? places.filter((place) => placeIds.includes(place.id)) : places
}

export function minPositivePlacePrice(places: Array<{ price: number }>): number {
  const prices = places.map((place) => Number(place.price)).filter((price) => Number.isFinite(price) && price > 0)
  return prices.length ? Math.min(...prices) : 0
}
