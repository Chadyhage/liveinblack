// Anti-fraud signed ticket token utilities
const SECRET = 'LIB_S3CR3T_K3Y_2026_PRIV'

function computeHash(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)).padStart(16, '0')
}

export function generateTicketToken(booking) {
  const payload = {
    tc: booking.ticketCode,
    ei: booking.eventId,
    en: booking.eventName,
    ed: booking.eventDate,
    pl: booking.place,
    pr: booking.placePrice,
    po: (booking.preorderSummary || []).map(i => ({
      n: i.name,
      e: i.emoji,
      q: (booking.preorderItems || {})[i.name] || 0,
      p: i.price,
    })),
    tp: booking.totalPrice,
    ba: booking.bookedAt,
  }
  const sig = computeHash(JSON.stringify(payload) + SECRET)
  try {
    return btoa(encodeURIComponent(JSON.stringify({ ...payload, sig })))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  } catch { return '' }
}

export function verifyTicketToken(token) {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - (base64.length % 4)) % 4
    const padded = base64 + '='.repeat(pad)
    const full = JSON.parse(decodeURIComponent(atob(padded)))
    const { sig, ...payload } = full
    const expected = computeHash(JSON.stringify(payload) + SECRET)
    return { valid: sig === expected, data: full }
  } catch {
    return { valid: false, data: null }
  }
}

// Boost helpers
export function getActiveBoosts() {
  try {
    const all = JSON.parse(localStorage.getItem('lib_boosts') || '[]')
    return all.filter(b => new Date(b.expiresAt) > new Date())
      .sort((a, b) => a.position - b.position)
  } catch { return [] }
}

export function saveBoost(eventId, position, days, price) {
  try {
    const boost = {
      eventId,
      position,
      price,
      days,
      purchasedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    }
    const all = JSON.parse(localStorage.getItem('lib_boosts') || '[]')
    const filtered = all.filter(b => b.eventId !== eventId)
    localStorage.setItem('lib_boosts', JSON.stringify([...filtered, boost]))
  } catch {}
}
