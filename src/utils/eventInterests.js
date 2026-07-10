const STORE_PREFIX = 'lib_event_interests_'
const MAX_INTERESTS = 200

const keyFor = uid => `${STORE_PREFIX}${uid || 'anonymous'}`

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function compactPlaceSummary(event) {
  const places = Array.isArray(event?.places) ? event.places : []
  const prices = places.map(p => Number(p?.price)).filter(n => Number.isFinite(n))
  const remaining = places.reduce((sum, p) => sum + Math.max(0, Number(p?.available) || 0), 0)
  return {
    minPrice: prices.length ? Math.min(...prices) : null,
    hasFreePlace: prices.some(price => price === 0),
    remaining,
  }
}

export function eventInterestSnapshot(event = {}) {
  const placeSummary = compactPlaceSummary(event)
  return {
    id: String(event.id || ''),
    name: event.name || 'Evenement',
    subtitle: event.subtitle || '',
    date: event.date || '',
    dateDisplay: event.dateDisplay || '',
    time: event.time || '',
    endTime: event.endTime || '',
    city: event.city || '',
    region: event.region || '',
    category: event.category || '',
    imageUrl: event.imageUrl || '',
    color: event.color || '#4ee8c8',
    accentColor: event.accentColor || event.color || '#4ee8c8',
    currency: event.currency || '',
    organizerId: event.organizerId || event.createdBy || '',
    cancelled: !!event.cancelled,
    minPrice: placeSummary.minPrice,
    hasFreePlace: placeSummary.hasFreePlace,
    remaining: placeSummary.remaining,
  }
}

export function normalizeEventInterests(items) {
  const seen = new Set()
  return (Array.isArray(items) ? items : [])
    .filter(item => item && item.eventId)
    .map(item => ({
      id: String(item.id || `${item.userId || 'user'}__${item.eventId}`),
      userId: item.userId ? String(item.userId) : '',
      eventId: String(item.eventId),
      status: item.status === 'removed' ? 'removed' : 'active',
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
      event: eventInterestSnapshot({ id: item.eventId, ...(item.event || {}) }),
    }))
    .filter(item => {
      const key = item.eventId
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_INTERESTS)
}

export function getEventInterests(uid) {
  if (!uid) return []
  return normalizeEventInterests(readJson(keyFor(uid), []))
}

export function cacheEventInterests(uid, items) {
  if (!uid) return []
  const clean = normalizeEventInterests(items).map(item => ({ ...item, userId: uid }))
  writeJson(keyFor(uid), clean)
  return clean
}

export function isInterestedInEvent(uid, eventId) {
  if (!uid || !eventId) return false
  return getEventInterests(uid).some(item => item.eventId === String(eventId) && item.status === 'active')
}

export async function markEventInterested(uid, event) {
  if (!uid || !event?.id) return getEventInterests(uid)
  const previous = getEventInterests(uid)
  const now = Date.now()
  const eventId = String(event.id)
  const existing = previous.find(item => item.eventId === eventId)
  if (existing?.status === 'active') return previous
  const item = {
    id: `${uid}__${eventId}`,
    userId: uid,
    eventId,
    status: 'active',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    event: eventInterestSnapshot(event),
  }
  const next = cacheEventInterests(uid, [item, ...previous.filter(saved => saved.eventId !== eventId)])
  try {
    const { syncDocAwaitable } = await import('./firestore-sync')
    const result = await syncDocAwaitable(`user_social/${uid}`, { interestedEvents: next, updatedAt: now })
    if (!result.ok) {
      cacheEventInterests(uid, previous)
      throw new Error(result.error || 'Sauvegarde impossible.')
    }
  } catch (error) {
    cacheEventInterests(uid, previous)
    throw error
  }
  window.dispatchEvent(new CustomEvent('lib:event-interests-updated', { detail: { uid, items: next } }))
  return next
}

export async function unmarkEventInterested(uid, eventId) {
  if (!uid || !eventId) return getEventInterests(uid)
  const previous = getEventInterests(uid)
  const id = String(eventId)
  const now = Date.now()
  const next = cacheEventInterests(uid, previous.map(item => (
    item.eventId === id ? { ...item, status: 'removed', updatedAt: now } : item
  )))
  try {
    const { syncDocAwaitable } = await import('./firestore-sync')
    const result = await syncDocAwaitable(`user_social/${uid}`, { interestedEvents: next, updatedAt: now })
    if (!result.ok) {
      cacheEventInterests(uid, previous)
      throw new Error(result.error || 'Retrait impossible.')
    }
  } catch (error) {
    cacheEventInterests(uid, previous)
    throw error
  }
  window.dispatchEvent(new CustomEvent('lib:event-interests-updated', { detail: { uid, items: next } }))
  return next
}
