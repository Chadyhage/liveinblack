// Tests de la règle « 1 place de groupe par compte et par événement ».
// Lancer : node scripts/groupTicketGuard.test.mjs
import { findGroupTieForEvent, groupTieBuyMessage } from '../lib/groupTicketGuard.js'

let failed = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else { failed++; console.error(`  ✗ ${name}`) }
}

// ── Faux Firestore : db.collection('tickets').where(...).where(...).get() ────
function fakeDb(tickets) {
  return {
    collection(name) {
      if (name !== 'tickets') throw new Error('collection inattendue : ' + name)
      const makeQuery = (filters) => ({
        where(field, op, value) {
          if (op !== '==') throw new Error('op inattendu')
          return makeQuery([...filters, [field, value]])
        },
        async get() {
          const docs = tickets
            .filter(t => filters.every(([f, v]) => String(t[f] ?? '') === String(v)))
            .map(t => ({ data: () => t }))
          return { docs }
        },
      })
      return makeQuery([])
    },
  }
}

const EVENT = 'evt1'
const TICKETS = [
  // Charbel : hôte d'une Table 8 (3 sièges) — siège 2 attribué à Chady
  { ticketCode: 'T-1', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'charbel', seatIndex: 0, place: 'Table 8', paid: true },
  { ticketCode: 'T-2', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'chady', seatIndex: 1, place: 'Table 8', paid: true },
  { ticketCode: 'T-3', eventId: 'evt1', tableId: 'tbl_A', hostUid: 'charbel', userId: 'charbel', seatIndex: 2, place: 'Table 8', paid: true },
  // Riri : billet SOLO sur le même événement (pas de tableId) → ne compte pas
  { ticketCode: 'S-1', eventId: 'evt1', userId: 'riri', place: 'Entrée', paid: true },
  // Fifi : siège de table sur un AUTRE événement → ne compte pas pour evt1
  { ticketCode: 'T-9', eventId: 'evt2', tableId: 'tbl_Z', hostUid: 'loulou', userId: 'fifi', place: 'Carré VIP', paid: true },
  // Siège révoqué : ne compte pas
  { ticketCode: 'T-R', eventId: 'evt1', tableId: 'tbl_B', hostUid: 'bob', userId: 'momo', place: 'Table 4', paid: true, revoked: true },
]

const db = fakeDb(TICKETS)

console.log('findGroupTieForEvent :')
const charbel = await findGroupTieForEvent(db, EVENT, 'charbel')
check('acheteur/hôte détecté (Charbel a acheté la Table 8)', charbel?.role === 'host' && charbel.tableId === 'tbl_A')
const chady = await findGroupTieForEvent(db, EVENT, 'chady')
check('membre assigné détecté (Chady a reçu un siège)', chady?.role === 'member' && chady.tableId === 'tbl_A')
check('billet solo ≠ place de groupe (Riri libre)', (await findGroupTieForEvent(db, EVENT, 'riri')) === null)
check('autre événement non compté (Fifi libre sur evt1)', (await findGroupTieForEvent(db, EVENT, 'fifi')) === null)
check('même personne, autre event → lié là-bas', (await findGroupTieForEvent(db, 'evt2', 'fifi'))?.role === 'member')
check('siège révoqué non compté (Momo libre)', (await findGroupTieForEvent(db, EVENT, 'momo')) === null)
check('hôte de table révoquée : billet revoked ignoré (Bob libre)', (await findGroupTieForEvent(db, EVENT, 'bob')) === null)
check('utilisateur inconnu → null', (await findGroupTieForEvent(db, EVENT, 'nobody')) === null)
check('params manquants → null', (await findGroupTieForEvent(db, '', 'charbel')) === null && (await findGroupTieForEvent(null, EVENT, 'x')) === null)

console.log('Messages :')
check('message hôte', groupTieBuyMessage(charbel).includes('déjà réservé une place de groupe'))
check('message membre', groupTieBuyMessage(chady).includes('fais déjà partie'))
check('nom de la place dans le message', groupTieBuyMessage(chady).includes('Table 8'))

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1) }
console.log('\nTous les tests passent ✓')
