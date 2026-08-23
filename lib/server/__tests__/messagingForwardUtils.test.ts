import { describe, expect, it } from 'vitest'
import {
  buildForwardedPoll,
  canForwardMessageType,
  normalizeForwardTargetIds,
  resolveForwardedLastMessageLabel,
} from '../messaging/messagingForwardUtils'

describe('messagingForwardUtils', () => {
  it('normalise et déduplique les cibles, avec garde-fous de cardinalité', () => {
    expect(normalizeForwardTargetIds([' a ', 'b', 'a', '', null])).toEqual({
      ok: true,
      targetIds: ['a', 'b'],
    })
    expect(normalizeForwardTargetIds([])).toEqual({ ok: false, error: 'invalid_input' })
    expect(normalizeForwardTargetIds(Array.from({ length: 21 }, (_, i) => `c${i}`))).toEqual({ ok: false, error: 'too_many_targets' })
  })

  it('refuse un message supprimé pour tous ou de type system', () => {
    expect(canForwardMessageType({ deletedForAll: true, type: 'text' } as never)).toEqual({ ok: false, error: 'message_deleted' })
    expect(canForwardMessageType({ deletedForAll: false, type: 'system' } as never)).toEqual({ ok: false, error: 'invalid_type' })
    expect(canForwardMessageType({ deletedForAll: false, type: 'text' } as never)).toEqual({ ok: true })
  })

  it('copie un sondage en réinitialisant tous les votes', () => {
    expect(
      buildForwardedPoll({
        pollType: 'poll',
        question: 'On mange quoi ?',
        options: [
          { id: '1', text: 'Pizza', voterIds: ['u1'] },
          { id: '2', text: 'Burger', voterIds: ['u2'] },
        ],
        event: null,
      } as never)
    ).toEqual({
      pollType: 'poll',
      question: 'On mange quoi ?',
      options: [
        { id: '1', text: 'Pizza', voterIds: [] },
        { id: '2', text: 'Burger', voterIds: [] },
      ],
      event: null,
    })
  })

  it('résout le libellé d’aperçu d’un transfert', () => {
    expect(resolveForwardedLastMessageLabel('text', 'Salut')).toBe('Salut')
    expect(resolveForwardedLastMessageLabel('image', null)).toBe('Photo')
    expect(resolveForwardedLastMessageLabel('voice', null)).toBe('Message vocal')
    expect(resolveForwardedLastMessageLabel('poll', null)).toBe('Message')
  })
})
