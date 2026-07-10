// Ticket token utilities — signature de COMMODITÉ uniquement.
//
// ⚠️ Ce SECRET est dans le bundle JS public : il ne protège RIEN contre un
// fraudeur motivé. La vraie défense anti-fraude est le registre Firestore
// tickets/{ticketCode} : seul le webhook Stripe (Admin SDK) peut y écrire
// paid:true, et le ScannerPage vérifie l'existence du billet dans ce registre
// avant de l'accepter. La signature ici sert seulement de pré-filtre rapide
// (rejeter les QR aléatoires sans requête réseau).
import { activeBoostsForRegion } from '../../lib/boosts.js'

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
    // cur = devise, uniquement si FCFA (les tokens EUR existants restent stables).
    ...(String(booking.currency || '').toUpperCase() === 'XOF' ? { cur: 'XOF' } : {}),
    // gn = nom de l'invité — uniquement présent pour un billet guestlist, pour
    // que /ticket/:token affiche son nom sans avoir besoin d'un compte/login.
    ...(booking.guestName ? { gn: booking.guestName } : {}),
    // sv = version du siège (place de table) — incrémentée à CHAQUE attribution/
    // révocation. Le scanner compare sv au registre : un QR émis avant une
    // réattribution (screenshot d'un invité révoqué) devient périmé. Absent pour
    // un billet normal → tokens EUR existants inchangés (rétrocompat).
    ...(Number(booking.seatVersion) > 0 ? { sv: Number(booking.seatVersion) } : {}),
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

export function saveBoost(eventId, position, days, price, region = '', userId = null) {
  try {
    const boost = {
      id: `boost_${eventId}_${position}_${Date.now()}`,
      eventId,
      position,
      region,
      price,
      days,
      userId,
      purchasedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    }
    const all = JSON.parse(localStorage.getItem('lib_boosts') || '[]')
    const filtered = all.filter(b =>
      b.eventId !== eventId ||
      !(b.position === position && (b.region || '') === (region || ''))
    )
    const updated = [...filtered, boost]
    // Mise à jour LOCALE uniquement (affichage immédiat). On NE sync PLUS
    // user_boosts/{uid} ici : le webhook Stripe en est le seul propriétaire
    // (comme pour les billets). Le client écrivait un id différent du webhook
    // → doublon dans user_boosts. La collection globale boosts/ (source du
    // Top 3) est aussi écrite par le webhook. Au prochain login, syncOnLogin
    // récupère la liste propre du serveur.
    localStorage.setItem('lib_boosts', JSON.stringify(updated))
  } catch {}
}

// Active boosts for a specific region (region-aware Top 3)
// boostsOverride : liste de boosts déjà chargée (ex : collection globale `boosts`
// streamée par listenBoosts). Si absent → fallback sur lib_boosts (localStorage,
// = uniquement les boosts du user courant — insuffisant pour un visiteur).
export function getActiveBoostsByRegion(regionName = '', boostsOverride = null) {
  const source = Array.isArray(boostsOverride) ? boostsOverride : getActiveBoosts()
  return activeBoostsForRegion(source, regionName === 'Toutes' ? '' : regionName)
}

// Check if a given Top-N slot is already taken in a given region
// boostsOverride : liste globale (cross-user) ; sinon fallback localStorage
export function isBoostSlotTaken(position, region = '', excludeEventId = null, boostsOverride = null) {
  try {
    const active = getActiveBoostsByRegion(region, boostsOverride)
    return active.some(b => Number(b.position) === Number(position) && String(b.eventId) !== String(excludeEventId))
  } catch { return false }
}

// Get the event name occupying a slot in a given region
export function getBoostSlotOccupant(position, region = '', allEvents = [], boostsOverride = null) {
  try {
    const active = getActiveBoostsByRegion(region, boostsOverride)
    const b = active.find(b => Number(b.position) === Number(position))
    if (!b) return null
    const ev = allEvents.find(e => e.id === b.eventId)
    return ev ? ev.name : 'un autre événement'
  } catch { return null }
}

// ─── Bookings helpers ─────────────────────────────────────────────────────────
export function getMyBookings(userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
    return all.filter(b => b.userId === userId)
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
// excludeEventId: ignores bookings for the same event (re-booking is allowed)
export function checkScheduleConflict(userId, newDateISO, newStart, newEnd, excludeEventId = null) {
  try {
    const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      .filter(b =>
        b.userId === userId &&
        b.eventDateISO && b.eventStartTime && b.eventEndTime &&
        (excludeEventId == null || String(b.eventId) !== String(excludeEventId))
      )

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
