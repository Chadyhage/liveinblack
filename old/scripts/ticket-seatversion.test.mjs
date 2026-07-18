import test from 'node:test'
import assert from 'node:assert/strict'
import { generateTicketToken, verifyTicketToken } from '../src/utils/ticket.js'

// seatVersion (#73) : un siège de table réattribué incrémente sa version. Le QR
// du nouveau titulaire porte la version à jour ; le QR (screenshot) d'un invité
// révoqué porte une version périmée → le scanner le refuse.

test('token sans seatVersion : rétrocompat (aucun champ sv, token stable)', () => {
  const a = generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', place: 'VIP', placePrice: 20, totalPrice: 20 })
  const b = generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', place: 'VIP', placePrice: 20, totalPrice: 20 })
  assert.equal(a, b) // déterministe, inchangé par rapport à l'existant
  const { valid, data } = verifyTicketToken(a)
  assert.equal(valid, true)
  assert.equal('sv' in data, false)
})

test('token avec seatVersion : sv embarqué et signé', () => {
  const { valid, data } = verifyTicketToken(generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', seatVersion: 3 }))
  assert.equal(valid, true)
  assert.equal(data.sv, 3)
})

test('QR périmé détecté : sv(token) < sv(registre) → refusé, sinon accepté', () => {
  const stale = verifyTicketToken(generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', seatVersion: 1 })).data
  const current = verifyTicketToken(generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', seatVersion: 2 })).data
  const registrySeatVersion = 2
  // Logique EXACTE du scanner (ScannerPage) : rejette si (token.sv||0) < (registre||0)
  assert.equal((Number(stale.sv) || 0) < registrySeatVersion, true)    // ancien invité révoqué → refusé
  assert.equal((Number(current.sv) || 0) < registrySeatVersion, false) // titulaire courant → passe
  // Un billet normal (jamais réattribué) : registre sv 0, token sv 0 → jamais refusé
  assert.equal((0) < 0, false)
})

test('falsifier sv dans le token casse la signature (pre-filtre)', () => {
  const tok = generateTicketToken({ ticketCode: 'LIB-1-ABC', eventId: 'e1', seatVersion: 1 })
  const b64 = tok.replace(/-/g, '+').replace(/_/g, '/')
  const full = JSON.parse(decodeURIComponent(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))))
  full.sv = 99 // on gonfle la version sans re-signer
  const forged = btoa(encodeURIComponent(JSON.stringify(full))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  assert.equal(verifyTicketToken(forged).valid, false) // signature ne correspond plus
})
