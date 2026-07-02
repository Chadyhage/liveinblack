// Guestlist — invitations gratuites/comp ajoutées par l'organisateur.
//
// Chaque invité reçoit un VRAI billet (tickets/{code}, paid:false, source:'guestlist')
// signé exactement comme un billet acheté — il scanne donc normalement au videur,
// et la place qu'il occupe est décomptée du stock de l'event (comme une résa
// gratuite classique) pour que le remplissage reste exact.
//
// Stockage : write-through cache, comme le reste de l'app — localStorage pour la
// lecture immédiate (lib_guestlist, keyed par eventId), Firestore guestlists/{eventId}
// pour la persistance cross-device (l'organisateur peut gérer sa guestlist depuis
// n'importe quel appareil).

import { generateTicketToken } from './ticket'

function readAll() {
  try { return JSON.parse(localStorage.getItem('lib_guestlist') || '{}') } catch { return {} }
}
function writeAll(all) {
  try { localStorage.setItem('lib_guestlist', JSON.stringify(all)) } catch {}
}

export function getGuestlist(eventId) {
  const all = readAll()
  return all[String(eventId)] || []
}

// Recharge depuis Firestore (cross-device) et met à jour le cache local.
export async function loadGuestlistRemote(eventId) {
  try {
    const { loadDoc } = await import('./firestore-sync')
    const doc = await loadDoc(`guestlists/${eventId}`)
    const items = doc?.items || []
    const all = readAll()
    all[String(eventId)] = items
    writeAll(all)
    return items
  } catch {
    return getGuestlist(eventId)
  }
}

function randomCode(len = 6) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, n => chars[n % chars.length]).join('')
}

// Ajoute un invité : réserve la place (anti-survente), crée le billet signé,
// et persiste l'entrée dans la guestlist de l'event.
// event: { id, name, dateDisplay, date, time, endTime }
// guest: { name, phone, note, placeType }
export async function addGuestlistEntry(event, guest, myId) {
  const placeType = guest.placeType || 'Invité'
  const name = (guest.name || '').trim()
  if (!name) return { ok: false, error: "Le nom de l'invité est obligatoire." }

  // 1) Décrément atomique du stock — une place guestlist occupe une vraie place,
  // au même titre qu'une réservation gratuite (sinon le remplissage serait faux
  // et l'event pourrait être survendu).
  try {
    const res = await fetch('/api/event-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, placeType, qty: 1, action: 'reserve' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'Plus de place disponible pour ce type.' }
  } catch {
    // Réseau indisponible — comme pour la résa gratuite, on ne bloque pas mais
    // on ne peut pas garantir l'absence de survente dans ce cas précis.
  }

  // 2) Billet signé — même format que les billets achetés/gratuits, pour scanner
  // sans aucune logique spéciale côté ScannerPage (juste source:'guestlist').
  const code = `LIB-${String(event.id).padStart(3, '0')}-${randomCode()}`
  const bookedAt = new Date().toISOString()
  const booking = {
    ticketCode: code,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.dateDisplay,
    place: placeType,
    placePrice: 0,
    totalPrice: 0,
    bookedAt,
    guestName: name,
  }
  const token = generateTicketToken(booking)

  const entry = {
    id: code,
    name,
    phone: (guest.phone || '').trim(),
    note: (guest.note || '').trim(),
    place: placeType,
    ticketCode: code,
    ticketToken: token,
    addedAt: bookedAt,
    addedBy: myId || null,
    checkedInAt: null,
    revoked: false,
  }

  const all = readAll()
  const list = [...(all[String(event.id)] || []), entry]
  all[String(event.id)] = list
  writeAll(all)

  // 3) Sync Firestore : la liste organisateur ET le registre anti-fraude tickets/.
  // mergeItemsById (transaction) et non syncDoc : deux membres du staff qui
  // ajoutent des invités en même temps ne s'écrasent plus mutuellement.
  import('./firestore-sync').then(({ mergeItemsById, syncDoc }) => {
    mergeItemsById(`guestlists/${event.id}`, { upserts: [entry] }).then(merged => {
      if (merged) { const a = readAll(); a[String(event.id)] = merged; writeAll(a) }
    })
    syncDoc(`tickets/${code}`, {
      ticketCode: code,
      eventId: event.id,
      eventName: event.name,
      place: placeType,
      guestName: name,
      paid: false,
      source: 'guestlist',
      addedBy: myId || null,
      bookedAt,
    })
  }).catch(() => {})

  return { ok: true, entry }
}

// Retire un invité qui n'est PAS encore arrivé : libère la place réservée et
// révoque son billet (le QR ne scannera plus). Un invité déjà check-in ne doit
// pas être retiré (il a physiquement occupé la place — voir guard dans l'UI).
export async function removeGuestlistEntry(eventId, entryId) {
  const all = readAll()
  const list = all[String(eventId)] || []
  const entry = list.find(e => e.id === entryId)
  if (!entry) return { ok: false }

  // Libère la place réservée pour cet invité.
  try {
    await fetch('/api/event-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, placeType: entry.place, qty: 1, action: 'release' }),
    })
  } catch {}

  const updated = list.filter(e => e.id !== entryId)
  all[String(eventId)] = updated
  writeAll(all)

  import('./firestore-sync').then(({ mergeItemsById, syncDoc }) => {
    // Suppression transactionnelle : ne touche que CET invité, les ajouts
    // concurrents des autres membres du staff sont préservés.
    mergeItemsById(`guestlists/${eventId}`, { removeIds: [entryId] }).then(merged => {
      if (merged) { const a = readAll(); a[String(eventId)] = merged; writeAll(a) }
    })
    syncDoc(`tickets/${entry.ticketCode}`, { revoked: true, revokedAt: new Date().toISOString() })
  }).catch(() => {})

  return { ok: true }
}
