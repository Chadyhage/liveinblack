import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getEventEndTimestamp,
  isEventOngoingOrStartingWithin,
} from '../src/utils/eventUrgency.js'
import { matchesEntityRegion } from '../src/utils/locations.js'
import { eventEffectiveEndMs, isEventEnded } from '../src/utils/event-time.js'
import { isClientDiscoverableEvent, isPlaceholderEvent } from '../src/utils/eventDiscovery.js'

test('une soirée qui traverse minuit reste visible jusqu’à son heure de fin', () => {
  const event = { date: '2026-07-05', time: '21:00', endTime: '06:00' }
  const during = new Date('2026-07-06T04:31:00+02:00').getTime()
  const after = new Date('2026-07-06T06:01:00+02:00').getTime()

  assert.equal(isEventOngoingOrStartingWithin(event, during), true)
  assert.equal(isEventOngoingOrStartingWithin(event, after), false)
  assert.equal(getEventEndTimestamp(event), new Date('2026-07-06T06:00:00').getTime())
})

test('un événement à venir entre dans la fenêtre de 18 heures, mais pas au-delà', () => {
  const now = new Date('2026-07-06T08:00:00').getTime()
  assert.equal(isEventOngoingOrStartingWithin({ date: '2026-07-06', time: '22:00', endTime: '04:00' }, now), true)
  assert.equal(isEventOngoingOrStartingWithin({ date: '2026-07-07', time: '08:30', endTime: '11:00' }, now), false)
})

test('Île-de-France correspond au filtre national France', () => {
  assert.equal(matchesEntityRegion({ region: 'Île-de-France', city: 'Paris' }, 'france'), true)
})

test('un billet expire à la fin de la soirée, y compris après minuit', () => {
  const event = { date: '2026-07-05', time: '21:00', endTime: '06:00' }
  const justBefore = new Date('2026-07-06T05:59:59').getTime()
  const atClosing = new Date('2026-07-06T06:00:00').getTime()

  assert.equal(isEventEnded(event, justBefore), false)
  assert.equal(isEventEnded(event, atClosing), true)
})

test('closingDate prime sur l’horaire théorique de fin', () => {
  const event = {
    date: '2026-07-05',
    time: '21:00',
    endTime: '02:00',
    closingDate: '2026-07-06T04:30:00',
  }

  assert.equal(eventEffectiveEndMs(event), new Date('2026-07-06T04:30:00').getTime())
  assert.equal(isEventEnded(event, new Date('2026-07-06T03:00:00').getTime()), false)
  assert.equal(isEventEnded(event, new Date('2026-07-06T04:30:00').getTime()), true)
})

test('la vitrine client ne met pas en avant les fillers, démos ou soirées passées', () => {
  const now = new Date('2026-07-07T12:00:00').getTime()

  assert.equal(isPlaceholderEvent({ name: 'Filler One' }), true)
  assert.equal(isClientDiscoverableEvent({
    id: 'real',
    name: 'AFRO NATION LOMÉ',
    date: '2026-09-19',
    time: '22:00',
    endTime: '05:00',
  }, now), true)
  assert.equal(isClientDiscoverableEvent({
    id: 'past',
    name: 'TEST COMPLET — LIVE IN BLACK 2026',
    date: '2026-07-05',
    time: '21:00',
    endTime: '06:00',
  }, now), false)
  assert.equal(isClientDiscoverableEvent({
    id: 'filler',
    name: 'Filler Two',
    date: '2026-07-10',
    time: '21:00',
    endTime: '05:00',
  }, now), false)
  assert.equal(isClientDiscoverableEvent({
    id: 'demo',
    name: 'Démo statistiques',
    date: '2026-07-10',
    time: '21:00',
    isDemo: true,
  }, now), false)
})
