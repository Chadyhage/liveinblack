import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePayoutMomoForCountry, configuredMomoCountries } from '../lib/eventPayouts.js'
import { momoCountryFromRegionName, regionByMomoCountry } from '../src/data/regions.js'

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
