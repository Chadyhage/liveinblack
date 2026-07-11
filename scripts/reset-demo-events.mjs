// scripts/reset-demo-events.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Réinitialise les événements de TEST dans Firestore :
//   1. SUPPRIME tous les événements existants + toutes leurs données liées
//      (billets, playlists, précommandes, POS, staff, guestlists, promos,
//      notifications, versements, boosts).
//   2. RECRÉE deux événements publics complets, VIDES (aucun billet vendu) :
//        • TEST — MOBILE MONEY (XOF, Lomé)  → tunnel FedaPay
//        • TEST — CARTE (EUR, Paris)        → tunnel Stripe
//      Chacun avec TOUTES les options : places solo (payante + VIP + gratuite),
//      place de GROUPE (table), PRÉCOMMANDES (menu), option INCLUSE au billet,
//      PLAYLIST interactive, PHOTO + VIDÉO.
//
// Sécurité : DRY-RUN par défaut — n'écrit RIEN, se contente de lister ce qui
// serait supprimé/créé. Ajoute --apply pour exécuter réellement.
//
// Usage :
//   node scripts/reset-demo-events.mjs <email-organisateur>           # dry-run
//   node scripts/reset-demo-events.mjs <email-organisateur> --apply   # exécute
//
// L'email = le compte organisateur qui possédera les 2 events (createdBy /
// organizerId). Nécessite .env.local (mêmes identifiants Firebase Admin que
// scripts/seed-demo-event.mjs).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import { getAuth } from 'firebase-admin/auth'
import { getDb } from '../lib/firebaseAdmin.js'

function loadLocalEnv() {
  const text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sep = line.indexOf('=')
    if (sep < 1) continue
    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const email = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!email || email.startsWith('--')) {
  throw new Error('Usage: node scripts/reset-demo-events.mjs <email-organisateur> [--apply]')
}

const db = getDb()
const owner = await getAuth().getUserByEmail(email)
const ownerName = owner.displayName || 'Organisateur'

// ── Dates : les 2 events dans 6 jours, 22h→05h (à venir, découvrables, scannables) ──
const start = new Date()
start.setDate(start.getDate() + 6)
const y = start.getFullYear(), m = String(start.getMonth() + 1).padStart(2, '0'), d = String(start.getDate()).padStart(2, '0')
const dateStr = `${y}-${m}-${d}`
const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']
const dateDisplay = `${d} ${MONTHS[start.getMonth()]} ${y}`

// ── Constructeur d'un event complet paramétré par la devise ──────────────────
// prices : { standard, vip, table, menu:{cocktail, champagne, burger, bouteille, eau} }
function buildEvent({ id, name, currency, region, city, location, prices }) {
  const menu = [
    { name: 'Cocktail signature', emoji: '🍹', price: prices.menu.cocktail, category: 'Cocktails', description: 'Cocktail maison de la soirée.' },
    { name: 'Coupe de champagne', emoji: '🥂', price: prices.menu.champagne, category: 'Bulles', description: 'Une coupe de champagne.' },
    { name: 'Burger nocturne', emoji: '🍔', price: prices.menu.burger, category: 'Food', description: 'Burger, frites, sauce maison.' },
    { name: 'Bouteille premium', emoji: '🍾', price: prices.menu.bouteille, category: 'Bouteilles', description: 'Bouteille + softs, espace réservé.' },
    { name: 'Eau', emoji: '💧', price: prices.menu.eau, category: 'Softs', description: 'Bouteille 50 cl.' },
  ]
  const places = [
    // Place payante standard
    { type: 'Standard', price: prices.standard, available: 200, total: 200, maxPerAccount: 6, groupType: 'solo', groupMin: 0, groupMax: 0, photos: [], included: [] },
    // Place VIP AVEC une option INCLUSE au billet (Coupe de champagne offerte)
    { type: 'VIP', price: prices.vip, available: 50, total: 50, maxPerAccount: 4, groupType: 'solo', groupMin: 0, groupMax: 0, photos: [], included: [{ name: 'Coupe de champagne', qty: 1 }] },
    // Place GRATUITE (test du flux de réservation sans paiement)
    { type: 'Invitation', price: 0, available: 30, total: 30, maxPerAccount: 2, groupType: 'solo', groupMin: 0, groupMax: 0, photos: [], included: [] },
    // Place de GROUPE / TABLE (6 personnes) — test tables + attribution de sièges
    { type: 'Table VIP (6 pers.)', price: prices.table, available: 10, total: 10, maxPerAccount: 1, groupType: 'group', groupMin: 2, groupMax: 6, photos: [], included: [] },
  ]
  return {
    id,
    name,
    subtitle: 'Afro · Amapiano · Hip-hop',
    description: 'Événement de TEST public — toutes les options activées : précommandes, playlist interactive, places de groupe, option incluse au billet, photo et vidéo. Achats à faire toi-même pour tester le tunnel complet.',
    date: dateStr,
    dateDisplay,
    time: '22:00',
    endTime: '05:00',
    city,
    region,
    location,
    category: 'Afro / Amapiano',
    organizer: ownerName,
    organizerName: ownerName,
    createdBy: owner.uid,
    organizerId: owner.uid,
    userCreated: true,
    isPrivate: false,          // PUBLIC
    isDemo: false,             // PAS un event démo → découvrable ET paiement réel
    currency,                  // 'XOF' (FedaPay) | 'EUR' (Stripe)
    minAge: 18,
    playlist: true,            // playlist interactive activée
    preorder: true,            // précommandes activées (menu ci-dessus)
    cancelled: false,
    color: '#4ee8c8',
    accentColor: '#c8a96e',
    imageUrl: '/img_club.png', // PHOTO de l'event
    videoUrl: '/discover.mp4', // VIDÉO / trailer de l'event
    attendees: 0,
    rating: 0,
    artists: [
      { name: 'DJ KAYO', role: 'DJ set' },
      { name: 'NOVA B', role: 'Live showcase' },
    ],
    places,
    menu,
    updatedAt: new Date().toISOString(),
  }
}

const eventXOF = buildEvent({
  id: 'test_all_options_xof',
  name: 'TEST — MOBILE MONEY (FCFA)',
  currency: 'XOF', region: 'Togo', city: 'Lomé', location: 'Sky Club, Lomé',
  prices: { standard: 5000, vip: 15000, table: 30000, menu: { cocktail: 3000, champagne: 6000, burger: 4000, bouteille: 60000, eau: 1000 } },
})
const eventEUR = buildEvent({
  id: 'test_all_options_eur',
  name: 'TEST — CARTE (EUR)',
  currency: 'EUR', region: 'France', city: 'Paris', location: 'Warehouse 19, Paris',
  prices: { standard: 15, vip: 45, table: 90, menu: { cocktail: 8, champagne: 12, burger: 10, bouteille: 120, eau: 2 } },
})
const NEW_EVENTS = [eventXOF, eventEUR]
const NEW_IDS = new Set(NEW_EVENTS.map(e => e.id))

// Playlist de démarrage (quelques titres) pour chaque event.
function starterPlaylist() {
  return {
    songs: [
      { id: 'seed-1', title: 'Calm Down', artist: 'Rema', likes: 12, myLike: false, addedBy: 'Organisateur', previewUrl: null },
      { id: 'seed-2', title: 'Water', artist: 'Tyla', likes: 9, myLike: false, addedBy: 'Organisateur', previewUrl: null },
      { id: 'seed-3', title: 'Soweto', artist: 'Victony', likes: 7, myLike: false, addedBy: 'Organisateur', previewUrl: null },
    ],
    updatedAt: new Date().toISOString(),
  }
}

// Collections mono-doc scopées à un event (clé = eventId), à nettoyer.
const EVENT_SCOPED_DOCS = [
  'event_playlists', 'event_promos', 'event_notifications', 'event_orders',
  'event_order_log', 'event_staff', 'guestlists', 'event_payouts',
  'event_refunds', 'event_cancellations',
]

// ── 1. Inventaire des events existants ───────────────────────────────────────
const eventsSnap = await db.collection('events').get()
const existing = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
const toDelete = existing.filter(e => !NEW_IDS.has(e.id)) // on ne se supprime pas soi-même

console.log(`\n=== INVENTAIRE (${existing.length} event(s) dans Firestore) ===`)
for (const e of existing) {
  console.log(` - ${e.id}  «${e.name || e.title || '?'}»  ${e.city || ''} ${e.currency || ''}${NEW_IDS.has(e.id) ? '  [sera RECRÉÉ]' : '  [SUPPRIMÉ]'}`)
}

// Compter les billets liés (par lots de 10 sur eventId in)
async function ticketsForEvents(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const snap = await db.collection('tickets').where('eventId', 'in', chunk).get()
    snap.forEach(doc => out.push(doc.ref))
  }
  return out
}
const delIds = toDelete.map(e => e.id)
const ticketRefs = delIds.length ? await ticketsForEvents(delIds) : []
console.log(`\n${toDelete.length} event(s) à supprimer · ${ticketRefs.length} billet(s) lié(s) à purger`)
console.log(`2 event(s) à (re)créer : ${NEW_EVENTS.map(e => e.id).join(', ')}`)

if (!APPLY) {
  console.log('\n>>> DRY-RUN : rien n\'a été modifié. Relance avec --apply pour exécuter. <<<\n')
  process.exit(0)
}

// ── 2. Suppression ───────────────────────────────────────────────────────────
async function batchDelete(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    refs.slice(i, i + 400).forEach(ref => batch.delete(ref))
    await batch.commit()
  }
}

// 2a. Billets des events supprimés
await batchDelete(ticketRefs)

// 2b. Docs mono-event (playlists, promos, POS, staff, guestlists, payouts…)
const scopedRefs = []
for (const coll of EVENT_SCOPED_DOCS) {
  for (const id of delIds) scopedRefs.push(db.collection(coll).doc(id))
}
await batchDelete(scopedRefs)

// 2c. Boosts liés aux events supprimés (collection globale boosts/)
const boostRefs = []
if (delIds.length) {
  for (let i = 0; i < delIds.length; i += 10) {
    const chunk = delIds.slice(i, i + 10)
    const snap = await db.collection('boosts').where('eventId', 'in', chunk).get().catch(() => ({ forEach: () => {} }))
    snap.forEach(doc => boostRefs.push(doc.ref))
  }
}
await batchDelete(boostRefs)

// 2d. Les documents events eux-mêmes
await batchDelete(toDelete.map(e => db.collection('events').doc(e.id)))

// ── 3. (Re)création des 2 events publics ─────────────────────────────────────
for (const ev of NEW_EVENTS) {
  await db.collection('events').doc(ev.id).set(ev)
  await db.collection('event_playlists').doc(ev.id).set(starterPlaylist())
}

// 3b. user_events du propriétaire = uniquement les 2 nouveaux events
await db.collection('user_events').doc(owner.uid).set(
  { items: NEW_EVENTS, updatedAt: new Date().toISOString() },
  { merge: true },
)

console.log(JSON.stringify({
  applied: true,
  owner: owner.email,
  deletedEvents: toDelete.length,
  deletedTickets: ticketRefs.length,
  deletedScopedDocs: scopedRefs.length,
  deletedBoosts: boostRefs.length,
  created: NEW_EVENTS.map(e => ({ id: e.id, name: e.name, currency: e.currency, city: e.city })),
}, null, 2))
console.log('\n✅ Terminé. Les 2 events de test sont publics, vides et prêts. Reconnecte-toi dans l\'app pour purger d\'éventuels billets fantômes.\n')
