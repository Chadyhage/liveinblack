import { describe, expect, it } from 'vitest'
import { resolveMemberMuteStatus } from '../messagingMuteUtils'

describe('messagingMuteUtils', () => {
  it('traite mutedUserIds legacy comme une sourdine indéfinie', () => {
    expect(resolveMemberMuteStatus({ mutedUserIds: ['u1'] }, 'u1', 0)).toEqual({
      muted: true,
      untilAtMs: null,
    })
  })

  it('traite une chaîne vide comme une sourdine indéfinie', () => {
    expect(resolveMemberMuteStatus({ memberMuteUntil: { u1: '' } }, 'u1', 0)).toEqual({
      muted: true,
      untilAtMs: null,
    })
  })

  it('considère expirée une échéance passée ou invalide', () => {
    const now = new Date('2026-08-20T12:00:00.000Z').getTime()
    expect(resolveMemberMuteStatus({ memberMuteUntil: { u1: '2026-08-20T11:59:59.000Z' } }, 'u1', now)).toEqual({
      muted: false,
      untilAtMs: null,
    })
    expect(resolveMemberMuteStatus({ memberMuteUntil: { u1: 'not-a-date' } }, 'u1', now)).toEqual({
      muted: false,
      untilAtMs: null,
    })
  })

  it('retourne la date future quand la sourdine est encore active', () => {
    const now = new Date('2026-08-20T12:00:00.000Z').getTime()
    const future = '2026-08-20T12:10:00.000Z'
    expect(resolveMemberMuteStatus({ memberMuteUntil: new Map([['u1', future]]) }, 'u1', now)).toEqual({
      muted: true,
      untilAtMs: new Date(future).getTime(),
    })
  })
})
