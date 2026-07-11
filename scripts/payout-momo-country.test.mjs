import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePayoutMomoForCountry, configuredMomoCountries, rearmFailedPayouts } from '../lib/eventPayouts.js'
import { momoCountryFromRegionName, regionByMomoCountry } from '../src/data/regions.js'

// ── Faux Firestore Admin minimal pour rearmFailedPayouts ──────────────────────
function makeDb(seed) {
  const store = new Map(Object.entries(seed)) // 'col/id' -> data
  function docRef(path) {
    return { path, id: path.split('/').pop(),
      async get() { return { exists: store.has(path), data: () => store.get(path), ref: docRef(path) } },
      set(data, _opts) { store.set(path, { ...(store.get(path) || {}), ...data }) } }
  }
  return { _store: store,
    collection: (name) => ({
      doc: (id) => docRef(`${name}/${id}`),
      where(field, _op, val) {
        return { async get() {
          const docs = []
          for (const [path, data] of store) {
            if (!path.startsWith(name + '/')) continue
            if (data[field] === val) docs.push({ id: path.split('/').pop(), data: () => data, ref: docRef(path) })
          }
          return { docs }
        } }
      },
    }) }
}

// ── Router le versement vers le numéro DU PAYS de l'événement ──────────────────
test('parsePayoutMomoForCountry : choisit le numéro du bon pays', () => {
  const u = { payoutMomos: {
    tg: { number: '+22890000000', country: 'tg' },
    bj: { number: '+22990000000', country: 'bj' },
  } }
  assert.equal(parsePayoutMomoForCountry(u, 'tg').number, '+22890000000')
  assert.equal(parsePayoutMomoForCountry(u, 'bj').number, '+22990000000')
  assert.equal(parsePayoutMomoForCountry(u, 'ci'), null) // pas de numéro CI → rien
})

test('parsePayoutMomoForCountry : legacy payoutMomo UNIQUEMENT si même pays (anti mauvais pays)', () => {
  // Ancien compte : un seul numéro togolais.
  const u = { payoutMomo: { number: '+22890000000', country: 'tg' } }
  assert.equal(parsePayoutMomoForCountry(u, 'tg').number, '+22890000000') // event Togo → OK
  assert.equal(parsePayoutMomoForCountry(u, 'bj'), null)                  // event Bénin → PAS le numéro togolais
})

test('parsePayoutMomoForCountry : pays INCONNU → JAMAIS le legacy (audit money-safety)', () => {
  // Le bug trouvé en revue : un pays null renvoyait le numéro legacy → mauvais pays.
  const u = { payoutMomo: { number: '+22890000000', country: 'tg' }, payoutMomos: { bj: { number: '+22990000000', country: 'bj' } } }
  assert.equal(parsePayoutMomoForCountry(u, null), null)      // pays indéterminé → rien (mise en attente)
  assert.equal(parsePayoutMomoForCountry(u, undefined), null)
  assert.equal(parsePayoutMomoForCountry(u, ''), null)
})

test('parsePayoutMomoForCountry : la map prime sur le legacy', () => {
  const u = {
    payoutMomo: { number: '+22890000000', country: 'tg' },
    payoutMomos: { tg: { number: '+22891111111', country: 'tg' } },
  }
  assert.equal(parsePayoutMomoForCountry(u, 'tg').number, '+22891111111')
})

test('parsePayoutMomoForCountry : déduit le pays de l\'indicatif si absent', () => {
  const u = { payoutMomos: { tg: { number: '+22890000000' } } } // pas de country explicite
  assert.equal(parsePayoutMomoForCountry(u, 'tg').country, 'tg') // +228 → tg
})

test('configuredMomoCountries : liste les pays réellement configurés', () => {
  const u = { payoutMomos: { tg: { number: '+22890000000' }, bj: { number: '' } }, payoutMomo: { number: '+22591000000', country: 'ci' } }
  const set = new Set(configuredMomoCountries(u))
  assert.equal(set.has('tg'), true)
  assert.equal(set.has('bj'), false) // numéro vide → non configuré
  assert.equal(set.has('ci'), true)  // legacy compte aussi
})

test('momoCountryFromRegionName : nom d\'event → code pays', () => {
  assert.equal(momoCountryFromRegionName('Togo'), 'tg')
  assert.equal(momoCountryFromRegionName('Bénin'), 'bj')
  assert.equal(momoCountryFromRegionName('France'), null) // EUR, pas de mobile money
  assert.equal(momoCountryFromRegionName('Ville inconnue'), null)
  assert.equal(regionByMomoCountry('bj')?.name, 'Bénin')
})

test('momoCountryFromRegionName : robuste aux accents/casse/apostrophes/id/code (money-safety)', () => {
  // Doit résoudre les variantes qui, sinon, laissaient un event XOF sans pays.
  assert.equal(momoCountryFromRegionName('BÉNIN'), 'bj')
  assert.equal(momoCountryFromRegionName('benin'), 'bj')
  assert.equal(momoCountryFromRegionName('bj'), 'bj')          // code
  assert.equal(momoCountryFromRegionName('togo'), 'tg')
  assert.equal(momoCountryFromRegionName('TG'), 'tg')
  assert.equal(momoCountryFromRegionName('cote-ivoire'), 'ci') // id
  assert.equal(momoCountryFromRegionName("Côte d'Ivoire"), 'ci') // apostrophe droite
  assert.equal(momoCountryFromRegionName('Côte d’Ivoire'), 'ci') // apostrophe courbe
  assert.equal(momoCountryFromRegionName('Cotonou'), null)     // une VILLE reste non résolue → mise en attente
})

// ── Auto-guérison des versements (#70) ────────────────────────────────────────
test('rearmFailedPayouts : ré-arme dès que le numéro du pays existe', async () => {
  const db = makeDb({
    'event_payouts/e1': { eventId: 'e1', sellerUid: 'o1', status: 'failed', failCode: 'no_momo_number', momoCountry: 'bj', amountDueXOF: 5000 },
    'events/e1': { name: 'Cotonou night', region: 'Bénin', cancelled: false },
    'users/o1': { payoutMomos: { bj: { number: '+22990000000', country: 'bj' } } }, // numéro AJOUTÉ
  })
  const n = await rearmFailedPayouts(db, 'o1')
  assert.equal(n, 1)
  assert.equal(db._store.get('event_payouts/e1').status, 'accumulating') // repart
  assert.equal(db._store.get('event_payouts/e1').failCode, null)
})

test('rearmFailedPayouts : NE ré-arme PAS si toujours pas de numéro', async () => {
  const db = makeDb({
    'event_payouts/e1': { eventId: 'e1', sellerUid: 'o1', status: 'failed', failCode: 'no_momo_number', momoCountry: 'bj', amountDueXOF: 5000 },
    'events/e1': { name: 'x', region: 'Bénin' },
    'users/o1': { payoutMomos: { tg: { number: '+22890000000', country: 'tg' } } }, // Togo seulement
  })
  const n = await rearmFailedPayouts(db, 'o1')
  assert.equal(n, 0)
  assert.equal(db._store.get('event_payouts/e1').status, 'failed') // reste en attente
})

test('rearmFailedPayouts : ne touche PAS un échec non ré-armable (event annulé)', async () => {
  const db = makeDb({
    'event_payouts/e1': { eventId: 'e1', sellerUid: 'o1', status: 'failed', failCode: 'event_cancelled', momoCountry: 'bj', amountDueXOF: 5000 },
    'events/e1': { name: 'x', region: 'Bénin', cancelled: true },
    'users/o1': { payoutMomos: { bj: { number: '+22990000000', country: 'bj' } } },
  })
  const n = await rearmFailedPayouts(db, 'o1')
  assert.equal(n, 0)
  assert.equal(db._store.get('event_payouts/e1').status, 'failed')
})
