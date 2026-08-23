import { describe, expect, it } from 'vitest'
import { findOtherParticipantId, hasBlockedEitherWay, toBlockedUserIdsMap } from '../messaging/messagingDirectBlockUtils'

describe('messagingDirectBlockUtils', () => {
  it('trouve l’autre participant dans une conversation directe', () => {
    expect(findOtherParticipantId(['u1', 'u2'], 'u1')).toBe('u2')
    expect(findOtherParticipantId(['u1'], 'u1')).toBeNull()
  })

  it('détecte un blocage dans les deux sens', () => {
    const map = new Map([
      ['u1', ['u2']],
      ['u2', []],
    ])
    expect(hasBlockedEitherWay(map, 'u1', 'u2')).toBe(true)

    const reverse = new Map([
      ['u1', []],
      ['u2', ['u1']],
    ])
    expect(hasBlockedEitherWay(reverse, 'u1', 'u2')).toBe(true)

    const none = new Map([
      ['u1', []],
      ['u2', []],
    ])
    expect(hasBlockedEitherWay(none, 'u1', 'u2')).toBe(false)
  })

  it('construit une map sûre des listes de blocage', () => {
    expect(
      toBlockedUserIdsMap([
        { _id: 'u1', blockedUserIds: ['u2'] },
        { _id: 'u2', blockedUserIds: null },
      ]),
    ).toEqual(new Map([
      ['u1', ['u2']],
      ['u2', []],
    ]))
  })
})
