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
    // Remove any existing boost for this event OR for this position (slot conflict)
    const filtered = all.filter(b => b.eventId !== eventId && b.position !== position)
    localStorage.setItem('lib_boosts', JSON.stringify([...filtered, boost]))
  } catch {}
}

// Check if a given position slot is already occupied by another event
export function isBoostSlotTaken(position, excludeEventId = null) {
  try {
    const active = getActiveBoosts()
    return active.some(b => b.position === position && b.eventId !== excludeEventId)
  } catch { return false }
}

// Get the event name occupying a slot (for conflict messaging)
export function getBoostSlotOccupant(position, allEvents = []) {
  try {
    const active = getActiveBoosts()
    const b = active.find(b => b.position === position)
    if (!b) return null
    const ev = allEvents.find(e => e.id === b.eventId)
    return ev ? ev.name : 'un autre événement'
  } catch { return null }
}

// ─── Bookings helpers ─────────────────────────────────────────────────────────
export function getMyBookings(userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
    return all.filter(b => b.userId === userId || b.userEmail)
  } catch { return [] }
}

function parseDateTime(dateISO, timeStr) {
  // dateISO: "2026-04-18", timeStr: "23:00"
  if (!dateISO || !timeStr) return 0
  const [h, m] = (timeStr || '00:00').split(':').map(Number)
  const d = new Date(dateISO + 'T00:00:00')
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

// Returns the conflicting booking if there's a time overlap, or null
export function checkScheduleConflict(userId, newDateISO, newStart, newEnd) {
  try {
    const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      .filter(b => b.userId === userId && b.eventDateISO && b.eventStartTime && b.eventEndTime)

    const ns = parseDateTime(newDateISO, newStart)
    let ne = parseDateTime(newDateISO, newEnd)
    // If end < start → crosses midnight → add 1 day
    if (ne <= ns) ne += 24 * 60 * 60 * 1000

    for (const b of bookings) {
      const es = parseDateTime(b.eventDateISO, b.eventStartTime)
      let ee = parseDateTime(b.eventDateISO, b.eventEndTime)
      if (ee <= es) ee += 24 * 60 * 60 * 1000

      // Overlap: not (ne <= es || ns >= ee)
      if (!(ne <= es || ns >= ee)) {
        return b // conflict
      }
    }
    return null
  } catch { return null }
}
