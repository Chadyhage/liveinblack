// Purge ponctuelle du registre tickets/{ticketCode} — billets orphelins.
//
// Contexte : avant la cascade de suppression d'événement, supprimer un event
// passait par un simple deleteDoc de events/{id} sans nettoyer le registre
// tickets/. Ces docs orphelins sont invisibles dans l'app (la purge des billets
// fantômes ne touche que user_bookings / lib_bookings) mais polluent la
// collection et les requêtes where('eventId','==',…).
//
// Ce que le script fait :
//   1. charge tous les ids de events/ (les events ANNULÉS y sont encore,
//      champ cancelled:true → leurs billets sont naturellement préservés)
//   2. scanne tickets/ par pages de 500
//   3. classe chaque billet : conservé / orphelin / démo (ignoré) / sans eventId (ignoré)
//   4. dry-run par défaut (compte rendu seul) ; --apply supprime pour de vrai,
//      avec re-vérification directe de chaque eventId orphelin juste avant
//      suppression (anti-course si un event vient d'être créé)
//
// Les billets démo (isDemo:true ou eventId demo_*) sont ignorés : l'event démo
// de seed-demo-event.mjs vit dans user_events/, pas dans events/, il serait
// faussement vu comme orphelin.
//
// Usage :
//   node scripts/purge-orphan-tickets.mjs           # dry-run
//   node scripts/purge-orphan-tickets.mjs --apply   # suppression réelle
//
// Credentials : FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// (lus depuis .env.local si présent, sinon depuis l'environnement).

import fs from 'node:fs'
import { FieldPath } from 'firebase-admin/firestore'
import { getDb } from '../lib/firebaseAdmin.js'

function loadLocalEnv() {
  let text
  try { text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8') } catch { return }
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

loadLocalEnv()
const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 500
const db = getDb()

// ── 1. Tous les ids d'events existants (annulés compris) ────────────────────
const eventsSnap = await db.collection('events').select().get()
const eventIds = new Set(eventsSnap.docs.map(d => d.id))
if (eventIds.size === 0) {
  console.error('ABANDON : events/ est vide — tous les billets seraient vus comme orphelins. Vérifier le projet/credentials.')
  process.exit(1)
}
console.log(`events/ : ${eventIds.size} événements existants`)

// ── 2. Scan de tickets/ par pages ────────────────────────────────────────────
const kept = { count: 0 }
const demo = { count: 0 }
const noEventId = { codes: [] }
const orphans = new Map() // eventId → { codes: [], paid: n, eventName }
let scanned = 0
let lastDoc = null

for (;;) {
  let q = db.collection('tickets')
    .orderBy(FieldPath.documentId())
    .select('eventId', 'eventName', 'isDemo', 'paid', 'userId')
    .limit(PAGE_SIZE)
  if (lastDoc) q = q.startAfter(lastDoc)
  const page = await q.get()
  if (page.empty) break
  lastDoc = page.docs[page.docs.length - 1]
  scanned += page.docs.length

  for (const doc of page.docs) {
    const t = doc.data()
    const eventId = t.eventId == null ? '' : String(t.eventId)
    if (t.isDemo === true || eventId.startsWith('demo_')) { demo.count += 1; continue }
    if (!eventId) { noEventId.codes.push(doc.id); continue }
    if (eventIds.has(eventId)) { kept.count += 1; continue }
    let group = orphans.get(eventId)
    if (!group) { group = { codes: [], paid: 0, eventName: t.eventName || '(sans nom)' }; orphans.set(eventId, group) }
    group.codes.push(doc.id)
    if (t.paid === true) group.paid += 1
  }
  process.stdout.write(`\rtickets/ scannés : ${scanned}`)
  if (page.docs.length < PAGE_SIZE) break
}
console.log(`\rtickets/ scannés : ${scanned}`)

// ── 3. Compte rendu ──────────────────────────────────────────────────────────
const orphanTotal = [...orphans.values()].reduce((n, g) => n + g.codes.length, 0)
console.log(`\nconservés (event existant, annulé compris) : ${kept.count}`)
console.log(`démo (ignorés) : ${demo.count}`)
console.log(`sans eventId (ignorés, à inspecter à la main) : ${noEventId.codes.length}${noEventId.codes.length ? ' — ' + noEventId.codes.slice(0, 10).join(', ') + (noEventId.codes.length > 10 ? '…' : '') : ''}`)
console.log(`ORPHELINS : ${orphanTotal} billets sur ${orphans.size} événements disparus\n`)
for (const [eventId, g] of orphans) {
  console.log(`  ${eventId}  « ${g.eventName} » — ${g.codes.length} billets (dont ${g.paid} payés)`)
  console.log(`    ex : ${g.codes.slice(0, 5).join(', ')}${g.codes.length > 5 ? '…' : ''}`)
}

if (!orphanTotal) { console.log('Rien à purger.'); process.exit(0) }
if (!APPLY) {
  console.log('\nDRY-RUN — aucune suppression. Relancer avec --apply pour purger.')
  process.exit(0)
}

// ── 4. Suppression réelle ────────────────────────────────────────────────────
// Re-vérification directe de chaque eventId juste avant suppression : si l'event
// est (ré)apparu entre le snapshot des ids et maintenant, on épargne ses billets.
let deleted = 0
for (const [eventId, g] of orphans) {
  const evSnap = await db.collection('events').doc(eventId).get()
  if (evSnap.exists) {
    console.log(`  épargné : ${eventId} existe finalement (${g.codes.length} billets conservés)`)
    continue
  }
  for (let offset = 0; offset < g.codes.length; offset += 400) {
    const batch = db.batch()
    g.codes.slice(offset, offset + 400).forEach(code => batch.delete(db.collection('tickets').doc(code)))
    await batch.commit()
    deleted += Math.min(400, g.codes.length - offset)
    process.stdout.write(`\rsupprimés : ${deleted}/${orphanTotal}`)
  }
}
console.log(`\rsupprimés : ${deleted}/${orphanTotal}`)
console.log('Purge terminée.')
