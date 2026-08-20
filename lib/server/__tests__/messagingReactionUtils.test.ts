import { describe, expect, it } from 'vitest'
import {
  buildReactionTogglePipeline,
  MAX_REACTION_EMOJI_LENGTH,
  normalizeReactionMap,
  validateReactionEmoji,
} from '../messagingReactionUtils'

describe('messagingReactionUtils', () => {
  it('valide un emoji non vide et borne sa longueur', () => {
    expect(validateReactionEmoji(' 👍 ')).toEqual({ ok: true, emoji: '👍' })
    expect(validateReactionEmoji('')).toEqual({ ok: false, error: 'invalid_input' })
    expect(validateReactionEmoji('x'.repeat(MAX_REACTION_EMOJI_LENGTH + 1))).toEqual({ ok: false, error: 'invalid_emoji' })
  })

  it('normalise une map de réactions en gardant seulement les tableaux de strings non vides', () => {
    expect(
      normalizeReactionMap({
        '👍': ['u1', 'u2'],
        '😂': [],
        fire: ['u3', 42, null],
        nope: 'bad',
      }),
    ).toEqual({
      '👍': ['u1', 'u2'],
      fire: ['u3'],
    })
  })

  it('construit un pipeline atomique avec nettoyage des clés temporaires', () => {
    const pipeline = buildReactionTogglePipeline('u1', '👍')
    expect(pipeline).toHaveLength(7)
    expect(pipeline.at(-1)).toEqual({
      $unset: ['__targetV', '__hadTarget', '__cleaned', '__hasTargetEntry', '__withTarget'],
    })
  })
})
