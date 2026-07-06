import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getEventEndTimestamp,
  isEventOngoingOrStartingWithin,
} from '../src/utils/eventUrgency.js'
import { matchesEntityRegion } from '../src/utils/locations.js'

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

