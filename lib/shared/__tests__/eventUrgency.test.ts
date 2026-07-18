// Port de scripts/event-discovery.test.mjs (sous-ensemble eventUrgency/event-time)
import { describe, it, expect } from 'vitest'
import { getEventEndTimestamp, isEventOngoingOrStartingWithin } from '../eventUrgency'
import { eventEffectiveEndMs, isEventEnded } from '../event-time'

describe('eventUrgency / event-time', () => {
  it('une soirée qui traverse minuit reste visible jusqu’à son heure de fin', () => {
    // Construits en heure LOCALE (comme `new Date(event.date + 'T00:00:00')`
    // dans la fonction testée) plutôt qu'avec un offset +02:00 codé en dur —
    // le test original supposait un runner à l'heure de Paris ; ici il reste
    // correct quel que soit le fuseau de la machine qui l'exécute.
    const event = { date: '2026-07-05', time: '21:00', endTime: '06:00' }
    const during = new Date(2026, 6, 6, 4, 31, 0).getTime()
    const after = new Date(2026, 6, 6, 6, 1, 0).getTime()

    expect(isEventOngoingOrStartingWithin(event, during)).toBe(true)
    expect(isEventOngoingOrStartingWithin(event, after)).toBe(false)
    expect(getEventEndTimestamp(event)).toBe(new Date('2026-07-06T06:00:00').getTime())
  })

  it('un événement à venir entre dans la fenêtre de 18 heures, mais pas au-delà', () => {
    const now = new Date('2026-07-06T08:00:00').getTime()
    expect(isEventOngoingOrStartingWithin({ date: '2026-07-06', time: '22:00', endTime: '04:00' }, now)).toBe(true)
    expect(isEventOngoingOrStartingWithin({ date: '2026-07-07', time: '08:30', endTime: '11:00' }, now)).toBe(false)
  })

  it('un billet expire à la fin de la soirée, y compris après minuit', () => {
    const event = { date: '2026-07-05', time: '21:00', endTime: '06:00' }
    const justBefore = new Date('2026-07-06T05:59:59').getTime()
    const atClosing = new Date('2026-07-06T06:00:00').getTime()

    expect(isEventEnded(event, justBefore)).toBe(false)
    expect(isEventEnded(event, atClosing)).toBe(true)
  })

  it('closingDate prime sur l’horaire théorique de fin', () => {
    const event = { date: '2026-07-05', time: '21:00', endTime: '02:00', closingDate: '2026-07-06T04:30:00' }

    expect(eventEffectiveEndMs(event)).toBe(new Date('2026-07-06T04:30:00').getTime())
    expect(isEventEnded(event, new Date('2026-07-06T03:00:00').getTime())).toBe(false)
    expect(isEventEnded(event, new Date('2026-07-06T04:30:00').getTime())).toBe(true)
  })
})
