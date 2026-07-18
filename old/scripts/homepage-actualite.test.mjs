import test from 'node:test'
import assert from 'node:assert/strict'

const {
  normalizeActualite,
  resolveActualiteEvents,
  accentOf,
  defaultActualite,
  ACTUALITE_ACCENTS,
} = await import('../src/utils/homepageConfig.js')

// Un événement « à venir » découvrable : date future, non annulé, public.
const YEAR_AHEAD = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const YEAR_AGO = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const upcoming = (id, extra = {}) => ({ id, name: `Event ${id}`, date: YEAR_AHEAD, time: '22:00', ...extra })

test('normalizeActualite : jamais d\'undefined, types garantis, accent contraint', () => {
  const c = normalizeActualite({ active: true, title: '  Festival  ', accent: 'chartreuse', eventIds: [1, '2', 2, '', null] })
  assert.equal(c.active, true)
  assert.equal(c.title, 'Festival')            // trim
  assert.equal(c.accent, 'teal')               // accent inconnu → teal
  assert.deepEqual(c.eventIds, ['1', '2'])     // stringifié, dédupliqué, vidé des faux
  assert.equal(typeof c.subtitle, 'string')
})

test('normalizeActualite : défauts sur objet vide / null', () => {
  const d = normalizeActualite(null)
  assert.equal(d.active, false)
  assert.equal(d.title, "L'actu du moment")
  assert.deepEqual(d.eventIds, [])
  assert.deepEqual(defaultActualite().eventIds, [])
})

test('normalizeActualite : plafonne à 12 événements', () => {
  const many = Array.from({ length: 20 }, (_, i) => String(i))
  assert.equal(normalizeActualite({ eventIds: many }).eventIds.length, 12)
})

test('resolveActualiteEvents : inactif ⇒ rien (jamais de section vide)', () => {
  const events = [upcoming('a')]
  assert.deepEqual(resolveActualiteEvents({ active: false, eventIds: ['a'] }, events), [])
})

test('resolveActualiteEvents : respecte l\'ordre curé, pas l\'ordre de la liste', () => {
  const events = [upcoming('a'), upcoming('b'), upcoming('c')]
  const out = resolveActualiteEvents({ active: true, eventIds: ['c', 'a'] }, events)
  assert.deepEqual(out.map(e => e.id), ['c', 'a'])
})

test('resolveActualiteEvents : filtre annulés, passés, privés, ids fantômes', () => {
  const events = [
    upcoming('ok'),
    upcoming('cancel', { cancelled: true }),
    upcoming('past', { date: YEAR_AGO }),
    upcoming('priv', { isPrivate: true }),
  ]
  const out = resolveActualiteEvents({ active: true, eventIds: ['ok', 'cancel', 'past', 'priv', 'ghost'] }, events)
  assert.deepEqual(out.map(e => e.id), ['ok'])
})

test('accentOf : accent connu vs fallback', () => {
  assert.equal(accentOf({ accent: 'gold' }).dot, ACTUALITE_ACCENTS.gold.dot)
  assert.equal(accentOf({ accent: 'nope' }).dot, ACTUALITE_ACCENTS.teal.dot)
  assert.equal(accentOf(null).dot, ACTUALITE_ACCENTS.teal.dot)
})
