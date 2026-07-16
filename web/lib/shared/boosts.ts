// Port TypeScript de lib/boosts.js — logique pure du système de boost
// (Top 1/2/3). Utilisé côté public (calcul du podium) ET plus tard côté achat
// (phase organisateur).
export type BoostTier = { label: string; price: number; days: number }
export type BoostPlan = { position: number; label: string; description: string; color: string; tiers: BoostTier[] }

export const BOOST_PLANS: readonly BoostPlan[] = Object.freeze([
  { position: 1, label: 'Top 1', description: 'Position n°1 · Visibilité maximale', color: '#c8a96e', tiers: [
    { label: '1 jour', price: 9.99, days: 1 }, { label: '3 jours', price: 24.99, days: 3 },
    { label: '1 semaine', price: 49.99, days: 7 }, { label: '1 mois', price: 149.99, days: 30 },
  ] },
  { position: 2, label: 'Top 2', description: 'Position n°2 · Très haute visibilité', color: 'rgba(255,255,255,0.65)', tiers: [
    { label: '1 jour', price: 6.99, days: 1 }, { label: '3 jours', price: 16.99, days: 3 },
    { label: '1 semaine', price: 34.99, days: 7 }, { label: '1 mois', price: 99.99, days: 30 },
  ] },
  { position: 3, label: 'Top 3', description: 'Position n°3 · Haute visibilité', color: 'rgba(200,169,110,0.6)', tiers: [
    { label: '1 jour', price: 3.99, days: 1 }, { label: '3 jours', price: 9.99, days: 3 },
    { label: '1 semaine', price: 19.99, days: 7 }, { label: '1 mois', price: 59.99, days: 30 },
  ] },
])

export function getBoostPlan(position: number, days: number): { plan: BoostPlan; tier: BoostTier } | null {
  const plan = BOOST_PLANS.find((item) => item.position === Number(position))
  const tier = plan?.tiers.find((item) => item.days === Number(days))
  return plan && tier ? { plan, tier } : null
}

export function normalizeBoostRegion(value: string = ''): string {
  const token = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!token) return ''
  if (token === 'fr' || token === 'france' || token.includes('france')) return 'france'
  if (token === 'tg' || token === 'togo' || token.includes('togo')) return 'togo'
  if (token === 'bj' || token === 'benin' || token.includes('benin')) return 'benin'
  return token.replace(/\s+/g, '-')
}

export function boostSlotId(region: string, position: number): string {
  return `${normalizeBoostRegion(region) || 'unknown'}__top_${Number(position)}`
}

export type BoostLike = {
  id?: string
  eventId?: string
  position?: number
  region?: string
  regionId?: string
  purchasedAt?: string | Date
  expiresAt?: string | Date
  status?: string
  conflict?: boolean
}

export function isBoostActive(boost: BoostLike | null | undefined, now: number = Date.now()): boolean {
  const expiry = new Date(boost?.expiresAt || 0).getTime()
  return (
    Number.isFinite(expiry) &&
    expiry > now &&
    boost?.conflict !== true &&
    !['refunded_conflict', 'cancelled'].includes(boost?.status || '')
  )
}

export function activeBoostsForRegion(boosts: BoostLike[] = [], region: string = '', now: number = Date.now()): BoostLike[] {
  const wanted = normalizeBoostRegion(region)
  return boosts
    .filter((boost) => isBoostActive(boost, now))
    .filter((boost) => {
      const actual = normalizeBoostRegion(boost.regionId || boost.region || '')
      return !wanted || !actual || actual === wanted
    })
    .sort((a, b) => {
      const byPosition = Number(a.position) - Number(b.position)
      if (byPosition) return byPosition
      const byPurchase = new Date(a.purchasedAt || 0).getTime() - new Date(b.purchasedAt || 0).getTime()
      return byPurchase || String(a.id || '').localeCompare(String(b.id || ''))
    })
}

export function buildRegionalTopThree<T extends { id?: string }>({
  events = [],
  fallbackEvents = [],
  boosts = [],
  region = '',
  now = Date.now(),
  isEligible = () => true,
}: {
  events?: T[]
  fallbackEvents?: T[]
  boosts?: BoostLike[]
  region?: string
  now?: number
  isEligible?: (event: T) => boolean
}): Array<T & { boostPosition?: number; displayPosition: number; featured: boolean }> {
  const byId = new Map(events.map((event) => [String(event.id), event]))
  const slots: Array<(T & { boostPosition?: number; displayPosition: number; featured: boolean }) | null> = [null, null, null]
  const used = new Set<string>()

  for (const boost of activeBoostsForRegion(boosts, region, now)) {
    const position = Number(boost.position)
    if (position < 1 || position > 3 || slots[position - 1]) continue
    const event = byId.get(String(boost.eventId))
    if (!event || !isEligible(event) || used.has(String(event.id))) continue
    slots[position - 1] = { ...event, boostPosition: position, displayPosition: position, featured: true }
    used.add(String(event.id))
  }

  let fallbackIndex = 0
  for (let index = 0; index < slots.length; index += 1) {
    while (!slots[index] && fallbackIndex < fallbackEvents.length) {
      const event = fallbackEvents[fallbackIndex++]
      if (!event || used.has(String(event.id)) || !isEligible(event)) continue
      slots[index] = { ...event, displayPosition: index + 1, featured: false }
      used.add(String(event.id))
    }
  }
  return slots.filter((s): s is T & { boostPosition?: number; displayPosition: number; featured: boolean } => Boolean(s))
}
