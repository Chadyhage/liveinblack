export const BOOST_PLANS = Object.freeze([
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

export function getBoostPlan(position, days) {
  const plan = BOOST_PLANS.find(item => item.position === Number(position))
  const tier = plan?.tiers.find(item => item.days === Number(days))
  return plan && tier ? { plan, tier } : null
}

export function normalizeBoostRegion(value = '') {
  const token = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!token) return ''
  if (token === 'fr' || token === 'france' || token.includes('france')) return 'france'
  if (token === 'tg' || token === 'togo' || token.includes('togo')) return 'togo'
  if (token === 'bj' || token === 'benin' || token.includes('benin')) return 'benin'
  return token.replace(/\s+/g, '-')
}

export function boostSlotId(region, position) {
  return `${normalizeBoostRegion(region) || 'unknown'}__top_${Number(position)}`
}

export function isBoostActive(boost, now = Date.now()) {
  const expiry = new Date(boost?.expiresAt || 0).getTime()
  return Number.isFinite(expiry) && expiry > now && boost?.conflict !== true
    && !['refunded_conflict', 'cancelled'].includes(boost?.status)
}

export function activeBoostsForRegion(boosts = [], region = '', now = Date.now()) {
  const wanted = normalizeBoostRegion(region)
  return boosts
    .filter(boost => isBoostActive(boost, now))
    .filter(boost => {
      const actual = normalizeBoostRegion(boost.regionId || boost.region)
      return !wanted || !actual || actual === wanted
    })
    .sort((a, b) => {
      const byPosition = Number(a.position) - Number(b.position)
      if (byPosition) return byPosition
      const byPurchase = new Date(a.purchasedAt || 0).getTime() - new Date(b.purchasedAt || 0).getTime()
      return byPurchase || String(a.id || '').localeCompare(String(b.id || ''))
    })
}

// Construit trois emplacements stables. Un boost Top 2 reste Top 2 même si le
// Top 1 n'a aucun candidat. Les places libres sont remplies par les événements
// naturels les plus proches, sans doublons.
export function buildRegionalTopThree({ events = [], fallbackEvents = [], boosts = [], region = '', now = Date.now(), isEligible = () => true }) {
  const byId = new Map(events.map(event => [String(event.id), event]))
  const slots = [null, null, null]
  const used = new Set()

  for (const boost of activeBoostsForRegion(boosts, region, now)) {
    const position = Number(boost.position)
    if (position < 1 || position > 3 || slots[position - 1]) continue
    const event = byId.get(String(boost.eventId))
    // used : un même événement boosté sur 2 positions (ex. Top 1 ET Top 2) ne
    // doit apparaître qu'UNE fois — sinon le podium affiche deux fois la même
    // carte. Les boosts sont triés par position croissante → il garde sa
    // meilleure position, la position redondante est laissée aux fallbacks.
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
  return slots.filter(Boolean)
}
