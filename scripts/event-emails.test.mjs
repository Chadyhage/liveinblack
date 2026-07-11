import test from 'node:test'
import assert from 'node:assert/strict'
import { eventCancelledEmail, eventPostponedEmail } from '../lib/email-templates.js'

test('eventCancelledEmail : sujet + contenu + échappement HTML', () => {
  const { subject, html } = eventCancelledEmail(
    { id: 'e1', name: 'Nuit <Rouge>', date: '10 août', time: '22:00' },
    { organizerName: 'DJ Test', refundNote: 'Remboursé sur ta carte sous quelques jours.' },
  )
  assert.match(subject, /Annulé/)
  assert.match(subject, /Nuit/)
  assert.match(html, /Événement annulé/)
  assert.match(html, /Remboursé sur ta carte/)
  assert.match(html, /&lt;Rouge&gt;/)          // XSS échappé
  assert.doesNotMatch(html, /<Rouge>/)         // jamais le tag brut
})

test('eventCancelledEmail : note de remboursement mobile money', () => {
  const { html } = eventCancelledEmail({ id: 'e1', name: 'Soirée' }, { refundNote: 'Remboursement mobile money en cours.' })
  assert.match(html, /mobile money en cours/)
})

test('eventPostponedEmail : ancienne + nouvelle date, billet gardé', () => {
  const { subject, html } = eventPostponedEmail(
    { id: 'e1', name: 'Soirée', date: '15 sept', time: '23:00' },
    { organizerName: 'Orga', previousWhen: '10 août · 22:00', newWhen: '15 sept · 23:00' },
  )
  assert.match(subject, /Reporté/)
  assert.match(html, /Événement reporté/)
  assert.match(html, /10 août/)                // ancienne (barrée)
  assert.match(html, /15 sept/)                // nouvelle
  assert.match(html, /billet reste valable/)
})
