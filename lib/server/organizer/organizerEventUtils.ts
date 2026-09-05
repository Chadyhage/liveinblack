import crypto from 'node:crypto'
import { normalizeShowOptions, type ShowOption } from '@/lib/shared/showOptions'

export interface PlaceInputLike {
  id: string
  type: string
  price: number
  total: number
  icon?: string
  maxPerAccount?: number
  groupType?: 'solo' | 'group'
  groupMin?: number
  groupMax?: number
  cancellationOptionEnabled?: boolean
  photos?: string[]
  included?: { name: string; qty: number }[]
}

export interface MenuItemInputLike {
  name: string
  emoji?: string
  imageUrl?: string | null
  price?: number
  category?: string
  description?: string
  available?: boolean
  hasShow?: boolean
  showOptions?: Array<ShowOption | string>
  excludedPlaces?: string[]
}

const MAX_PLACE_TYPES = 40
export const RECAP_WINDOW_START_MS = 24 * 60 * 60 * 1000
export const RECAP_WINDOW_END_MS = 48 * 60 * 60 * 1000
const BENIN_UTC_OFFSET_MINUTES = 60

export function assignStablePlaceIds<T extends PlaceInputLike>(places: T[]): Array<T & { available: number }> {
  return places.map((place) => ({ ...place, id: place.id?.trim() || `p${crypto.randomBytes(6).toString('hex')}`, available: place.total }))
}

export function placeConsumed(place: { total?: number | null; available?: number | null }): number {
  return Math.max(0, (place.total ?? 0) - (place.available ?? 0))
}

export function validatePlaces(places: PlaceInputLike[]): string | null {
  if (places.length > MAX_PLACE_TYPES) return 'too_many_place_types'
  for (const place of places) {
    if (!place.type?.trim()) return 'place_type_required'
    if (!Number.isFinite(place.price) || place.price < 0) return 'invalid_place_price'
    if (!Number.isFinite(place.total) || place.total < 0 || !Number.isInteger(place.total)) return 'invalid_place_qty'
    if (place.maxPerAccount !== undefined && (!Number.isFinite(place.maxPerAccount) || place.maxPerAccount < 0)) {
      return 'invalid_place_max_per_account'
    }
    if (place.groupType === 'group' && !(place.price > 0)) return 'group_place_requires_price'
    if (place.groupType === 'group') {
      const min = place.groupMin ?? 0
      const max = place.groupMax ?? 0
      if (!Number.isFinite(min) || min < 0) return 'invalid_group_min'
      if (!Number.isFinite(max) || max < 0) return 'invalid_group_max'
      if (min > 0 && max > 0 && max < min) return 'group_max_below_min'
    }
  }
  if (!places.some((place) => place.price > 0)) return 'paid_event_required'
  return null
}

export function normalizeMenuItems<T extends MenuItemInputLike>(menu: T[] | null | undefined): T[] {
  return (menu || []).map((item) => ({
    ...item,
    available: item.available !== false,
    showOptions: item.hasShow ? normalizeShowOptions(item.showOptions) : [],
  }))
}

export function toEventDates(date: string) {
  const d = new Date(date + 'T00:00:00')
  return d
    .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace('.', '')
}

export function parseBeninLocalDateTime(value: string | null | undefined): Date | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const explicit = new Date(raw)
    return Number.isNaN(explicit.getTime()) ? null : explicit
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute) - BENIN_UTC_OFFSET_MINUTES,
    Number(second),
  )
  const date = new Date(utcMs)
  return Number.isNaN(date.getTime()) ? null : date
}

export function shouldSendEventRecap(startMs: number, now: number): boolean {
  return startMs >= now + RECAP_WINDOW_START_MS && startMs <= now + RECAP_WINDOW_END_MS
}
