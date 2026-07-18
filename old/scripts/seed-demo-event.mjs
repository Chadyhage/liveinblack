import fs from 'node:fs'
import { getAuth } from 'firebase-admin/auth'
import { getDb } from '../lib/firebaseAdmin.js'

function loadLocalEnv() {
  const text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

function seeded(index, salt = 1) {
  const value = Math.sin((index + 1) * 999 * salt) * 10000
  return value - Math.floor(value)
}

function isoDaysAgo(days, hour) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, Math.floor(seeded(days, hour + 1) * 60), 0, 0)
  return date.toISOString()
}

loadLocalEnv()
const email = process.argv[2]
if (!email) throw new Error('Usage: node scripts/seed-demo-event.mjs <email-organisateur>')

const db = getDb()
const owner = await getAuth().getUserByEmail(email)
const eventId = 'demo_black_pulse_2026'
const event = {
  id: eventId,
  name: 'BLACK PULSE — DÉMO STATS',
  subtitle: 'Afro · Amapiano · Hip-hop',
  description: 'Événement de démonstration privé créé pour tester les statistiques, les précommandes et la playlist interactive.',
  date: '2026-07-18',
  dateDisplay: '18 JUIL. 2026',
  time: '22:30',
  endTime: '05:30',
  city: 'Paris',
  region: 'Île-de-France',
  location: 'Warehouse 19, Paris',
  category: 'Afro / Amapiano',
  organizer: owner.displayName || 'Charbel',
  organizerName: owner.displayName || 'Charbel',
  createdBy: owner.uid,
  organizerId: owner.uid,
  userCreated: true,
  isPrivate: true,
  privateCode: 'DEMO2026',
  isDemo: true,
  demoLabel: 'Données simulées — aucun paiement réel',
  playlist: true,
  preorder: true,
  cancelled: false,
  color: '#4ee8c8',
  accentColor: '#c8a96e',
  attendees: 0,
  rating: 0,
  artists: [
    { name: 'DJ KAYO', role: 'DJ set' },
    { name: 'NOVA B', role: 'Live showcase' },
  ],
  places: [
    { type: 'Early Bird', price: 18, available: 90, total: 90, maxPerAccount: 4, groupType: 'solo', photos: [] },
    { type: 'Standard', price: 28, available: 150, total: 150, maxPerAccount: 6, groupType: 'solo', photos: [] },
    { type: 'VIP Backstage', price: 65, available: 40, total: 40, maxPerAccount: 4, groupType: 'solo', photos: [] },
    { type: 'Invitation', price: 0, available: 20, total: 20, maxPerAccount: 2, groupType: 'solo', photos: [] },
  ],
  menu: [
    { name: 'Mojito Black', emoji: '🍹', price: 9, category: 'Cocktails', description: 'Mojito signature mûre et menthe.' },
    { name: 'Pass 3 boissons', emoji: '🥂', price: 21, category: 'Packs', description: 'Trois boissons au choix.' },
    { name: 'Burger nocturne', emoji: '🍔', price: 13, category: 'Food', description: 'Burger, frites et sauce maison.' },
    { name: 'Bouteille premium', emoji: '🍾', price: 120, category: 'Bouteilles', description: 'Bouteille et softs, espace réservé.' },
    { name: 'Eau fraîche', emoji: '💧', price: 3, category: 'Softs', description: 'Bouteille 50 cl.' },
  ],
  updatedAt: new Date().toISOString(),
}

const distribution = [
  ['Early Bird', 54],
  ['Standard', 88],
  ['VIP Backstage', 22],
  ['Invitation', 12],
]
const menu = event.menu
const tickets = []
let globalIndex = 0
for (const [place, count] of distribution) {
  for (let index = 0; index < count; index += 1) {
    globalIndex += 1
    const isInvitation = place === 'Invitation'
    const daysAgo = Math.max(0, 44 - Math.floor((globalIndex / 176) * 43) + Math.floor(seeded(globalIndex, 2) * 4))
    const preorderItems = {}
    const preorderSummary = []
    if (!isInvitation && seeded(globalIndex, 3) > 0.43) {
      const first = menu[Math.floor(seeded(globalIndex, 4) * menu.length)]
      preorderItems[first.name] = seeded(globalIndex, 5) > 0.72 ? 2 : 1
      preorderSummary.push(first)
      if (seeded(globalIndex, 6) > 0.82) {
        const second = menu[(menu.indexOf(first) + 2) % menu.length]
        preorderItems[second.name] = 1
        preorderSummary.push(second)
      }
    }
    const preorderTotal = preorderSummary.reduce((sum, item) => sum + item.price * preorderItems[item.name], 0)
    const placePrice = event.places.find(item => item.type === place)?.price || 0
    const checkedIn = globalIndex <= 119 && seeded(globalIndex, 7) > 0.12
    tickets.push({
      id: `D${String(globalIndex).padStart(4, '0')}`,
      ticketCode: `LIB-DEMO-${String(globalIndex).padStart(4, '0')}`,
      eventId,
      eventName: event.name,
      place,
      placePrice,
      paid: !isInvitation,
      paymentMethod: isInvitation ? 'invitation' : ['card', 'apple_pay', 'google_pay'][globalIndex % 3],
      source: isInvitation ? 'demo-invitation' : 'demo-simulation',
      isDemo: true,
      userId: `demo-buyer-${String((globalIndex % 121) + 1).padStart(3, '0')}`,
      userName: `Participant Démo ${globalIndex}`,
      bookedAt: isoDaysAgo(daysAgo, 9 + (globalIndex % 13)),
      preorderItems,
      preorderSummary,
      totalPrice: placePrice + preorderTotal,
      ...(checkedIn ? { checkedInAt: isoDaysAgo(0, 20 + (globalIndex % 4)), checkedInBy: 'demo-scanner' } : {}),
    })
  }
}

// Remplace uniquement une précédente simulation portant le même ID.
const existingTickets = await db.collection('tickets').where('eventId', '==', eventId).get()
for (let offset = 0; offset < existingTickets.docs.length; offset += 400) {
  const batch = db.batch()
  existingTickets.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref))
  await batch.commit()
}

for (let offset = 0; offset < tickets.length; offset += 400) {
  const batch = db.batch()
  tickets.slice(offset, offset + 400).forEach(ticket => batch.set(db.collection('tickets').doc(ticket.ticketCode), ticket))
  await batch.commit()
}

const userEventsRef = db.collection('user_events').doc(owner.uid)
const userEventsSnap = await userEventsRef.get()
const currentItems = userEventsSnap.exists ? (userEventsSnap.data().items || []) : []
const nextItems = [...currentItems.filter(item => String(item.id) !== eventId), event]
await userEventsRef.set({ items: nextItems, updatedAt: new Date().toISOString() }, { merge: true })

await db.collection('event_playlists').doc(eventId).set({
  songs: [
    { id: 'demo-song-1', title: 'Calm Down', artist: 'Rema', likes: 46, myLike: false, addedBy: 'Sarah', previewUrl: null },
    { id: 'demo-song-2', title: 'Unavailable', artist: 'Davido', likes: 39, myLike: false, addedBy: 'Malik', previewUrl: null },
    { id: 'demo-song-3', title: 'Water', artist: 'Tyla', likes: 34, myLike: false, addedBy: 'Inès', previewUrl: null },
    { id: 'demo-song-4', title: 'Soweto', artist: 'Victony', likes: 29, myLike: false, addedBy: 'Lucas', previewUrl: null },
    { id: 'demo-song-5', title: 'KU LO SA', artist: 'Oxlade', likes: 25, myLike: false, addedBy: 'Chloé', previewUrl: null },
    { id: 'demo-song-6', title: 'Rush', artist: 'Ayra Starr', likes: 21, myLike: false, addedBy: 'Nora', previewUrl: null },
  ],
  isDemo: true,
  updatedAt: new Date().toISOString(),
})

const preorderTickets = tickets.filter(ticket => ticket.preorderSummary.length)
const checkedInTickets = tickets.filter(ticket => ticket.checkedInAt)
console.log(JSON.stringify({
  owner: owner.email,
  eventId,
  eventName: event.name,
  tickets: tickets.length,
  paid: tickets.filter(ticket => ticket.paid).length,
  invitations: tickets.filter(ticket => !ticket.paid).length,
  withPreorders: preorderTickets.length,
  checkedIn: checkedInTickets.length,
  playlistSongs: 6,
}))
