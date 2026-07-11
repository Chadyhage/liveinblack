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
