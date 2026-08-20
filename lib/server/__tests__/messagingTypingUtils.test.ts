import { describe, expect, it } from 'vitest'
import { buildTypingUsers, collectActiveTypingUserIds } from '../messagingTypingUtils'

describe('messagingTypingUtils', () => {
  it('garde seulement les utilisateurs actifs hors appelant', () => {
    const now = new Date('2026-08-20T16:00:00.000Z').getTime()
    expect(
      collectActiveTypingUserIds(
        {
          me: '2026-08-20T15:59:59.500Z',
          u1: '2026-08-20T15:59:58.000Z',
          u2: '2026-08-20T15:59:54.999Z',
          u3: 'not-a-date',
        },
        'me',
        5_000,
        now,
      )
    ).toEqual(['u1'])
  })

  it('accepte aussi une Map comme source', () => {
    const now = new Date('2026-08-20T16:00:00.000Z').getTime()
    expect(
      collectActiveTypingUserIds(
        new Map([
          ['u1', '2026-08-20T15:59:59.000Z'],
          ['u2', '2026-08-20T15:59:50.000Z'],
        ]),
        'me',
        5_000,
        now,
      )
    ).toEqual(['u1'])
  })

  it('projette les utilisateurs avec un fallback vide si le nom manque', () => {
    expect(
      buildTypingUsers(
        ['u1', 'u2'],
        new Map([['u1', 'Alice']]),
      )
    ).toEqual([
      { userId: 'u1', name: 'Alice' },
      { userId: 'u2', name: '' },
    ])
  })
})
