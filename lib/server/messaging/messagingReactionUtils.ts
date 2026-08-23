export const MAX_REACTION_EMOJI_LENGTH = 32

export function validateReactionEmoji(rawEmoji: string | undefined): { ok: true; emoji: string } | { ok: false; error: 'invalid_input' | 'invalid_emoji' } {
  const emoji = rawEmoji?.trim() ?? ''
  if (!emoji) return { ok: false, error: 'invalid_input' }
  if (emoji.length > MAX_REACTION_EMOJI_LENGTH) return { ok: false, error: 'invalid_emoji' }
  return { ok: true, emoji }
}

export function buildReactionTogglePipeline(callerId: string, emoji: string): Record<string, unknown>[] {
  return [
    {
      $set: {
        __targetV: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $map: {
                    input: {
                      $filter: {
                        input: { $objectToArray: { $ifNull: ['$reactions', {}] } },
                        as: 'e',
                        cond: { $eq: ['$$e.k', emoji] },
                      },
                    },
                    as: 'e',
                    in: '$$e.v',
                  },
                },
                0,
              ],
            },
            [],
          ],
        },
      },
    },
    { $set: { __hadTarget: { $in: [callerId, '$__targetV'] } } },
    {
      $set: {
        __cleaned: {
          $map: {
            input: { $objectToArray: { $ifNull: ['$reactions', {}] } },
            as: 'e',
            in: { k: '$$e.k', v: { $filter: { input: '$$e.v', as: 'uid', cond: { $ne: ['$$uid', callerId] } } } },
          },
        },
      },
    },
    {
      $set: {
        __hasTargetEntry: {
          $gt: [{ $size: { $filter: { input: '$__cleaned', as: 'e', cond: { $eq: ['$$e.k', emoji] } } } }, 0],
        },
      },
    },
    {
      $set: {
        __withTarget: {
          $cond: [
            '$__hadTarget',
            '$__cleaned',
            {
              $cond: [
                '$__hasTargetEntry',
                {
                  $map: {
                    input: '$__cleaned',
                    as: 'e',
                    in: {
                      k: '$$e.k',
                      v: { $cond: [{ $eq: ['$$e.k', emoji] }, { $concatArrays: ['$$e.v', [callerId]] }, '$$e.v'] },
                    },
                  },
                },
                { $concatArrays: ['$__cleaned', [{ k: emoji, v: [callerId] }]] },
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        reactions: {
          $arrayToObject: { $filter: { input: '$__withTarget', as: 'e', cond: { $gt: [{ $size: '$$e.v' }, 0] } } },
        },
      },
    },
    { $unset: ['__targetV', '__hadTarget', '__cleaned', '__hasTargetEntry', '__withTarget'] },
  ]
}

export function normalizeReactionMap(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([emoji, users]) => [
      emoji,
      Array.isArray(users) ? users.filter((userId): userId is string => typeof userId === 'string') : [],
    ]).filter(([, users]) => users.length > 0),
  )
}
