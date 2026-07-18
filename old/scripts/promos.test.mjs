import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePromo, promoUnitDiscount, normalizePromoCode } from '../lib/promos.js'

// Faux Firestore : un unique doc event_promos/{eventId} avec la liste de codes.
function fakeDb(items) {
  return {
    collection() {
      return {
        doc() {
          return { async get() { return { exists: true, data: () => ({ items }) } } }
        },
      }
    },
  }
}

test('resolvePromo : code inconnu refusé', async () => {
  const db = fakeDb([{ code: 'WELCOME', type: 'percent', value: 20, maxUses: 10, usedCount: 0 }])
  const r = await resolvePromo(db, 'e1', 'NOPE', 1)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'unknown')
})

test('resolvePromo : #69 une commande ne peut pas dépasser les utilisations restantes', async () => {
  // maxUses 1, usedCount 0 → 1 restante. Commander 5 billets doit être REFUSÉ.
  // Avant le fix : `usedCount < maxUses` passait, puis registerPromoUse ajoutait
  // 5 → un code « 1 seule fois » offrait la réduction sur 5 billets.
  const db = fakeDb([{ code: 'SOLO', type: 'percent', value: 50, maxUses: 1, usedCount: 0 }])
  const bulk = await resolvePromo(db, 'e1', 'SOLO', 5)
  assert.equal(bulk.ok, false)
  assert.equal(bulk.reason, 'insufficient_uses')
  // Commander 1 seul billet passe.
  const one = await resolvePromo(db, 'e1', 'SOLO', 1)
  assert.equal(one.ok, true)
})

test('resolvePromo : plafond partiel (3 restantes → 3 ok, 4 refusé)', async () => {
  const db = fakeDb([{ code: 'PROMO', type: 'fixed', value: 5, maxUses: 10, usedCount: 7 }])
  assert.equal((await resolvePromo(db, 'e1', 'PROMO', 3)).ok, true)   // 7+3 = 10 ok
  assert.equal((await resolvePromo(db, 'e1', 'PROMO', 4)).ok, false)  // 7+4 = 11 > 10
})

test('resolvePromo : maxUses 0 = illimité', async () => {
  const db = fakeDb([{ code: 'ILLIMITE', type: 'percent', value: 10, maxUses: 0, usedCount: 9999 }])
  assert.equal((await resolvePromo(db, 'e1', 'ILLIMITE', 20)).ok, true)
})

test('resolvePromo : code épuisé refusé', async () => {
  const db = fakeDb([{ code: 'DONE', type: 'percent', value: 10, maxUses: 5, usedCount: 5 }])
  const r = await resolvePromo(db, 'e1', 'DONE', 1)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'exhausted')
})

test('resolvePromo : inactif / expiré refusés', async () => {
  const inactive = fakeDb([{ code: 'OFF', type: 'percent', value: 10, active: false }])
  assert.equal((await resolvePromo(inactive, 'e1', 'OFF', 1)).reason, 'inactive')
  const expired = fakeDb([{ code: 'OLD', type: 'percent', value: 10, expiresAt: '2000-01-01T00:00:00Z' }])
  assert.equal((await resolvePromo(expired, 'e1', 'OLD', 1)).reason, 'expired')
})

test('promoUnitDiscount : percent et fixed, bornés au prix du billet', () => {
  assert.equal(promoUnitDiscount({ type: 'percent', value: 20 }, 2000, 100), 400) // 20 % de 20 €
  assert.equal(promoUnitDiscount({ type: 'fixed', value: 5 }, 2000, 100), 500)    // 5 € de 20 €
  assert.equal(promoUnitDiscount({ type: 'fixed', value: 999 }, 2000, 100), 2000) // jamais > prix
  assert.equal(promoUnitDiscount({ type: 'fixed', value: 500 }, 5000, 1), 500)    // XOF entiers
})

test('normalizePromoCode : trim, majuscules, sans espaces', () => {
  assert.equal(normalizePromoCode('  we l come '), 'WELCOME')
})
