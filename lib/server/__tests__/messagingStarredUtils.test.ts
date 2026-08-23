import { describe, expect, it } from 'vitest'
import {
  buildConversationLookup,
  normalizeStarredPagination,
  resolveVisibleStarredConversations,
} from '../messaging/messagingStarredUtils'

describe('messagingStarredUtils', () => {
  it('normalise page, pageSize et skip avec garde-fous', () => {
    expect(normalizeStarredPagination({ page: 0, pageSize: 999 })).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
    })
    expect(normalizeStarredPagination({ page: 3, pageSize: 12 })).toEqual({
      page: 3,
      pageSize: 12,
      skip: 24,
    })
  })

  it('construit le lookup des conversations visibles', () => {
    const lookup = buildConversationLookup([
      { _id: 'c1', type: 'direct', participantIds: ['u1', 'u2'], createdAt: '2026-08-20T10:00:00.000Z' },
      { _id: 'c2', type: 'group', participantIds: ['u1', 'u3'], createdAt: '2026-08-20T10:00:00.000Z' },
    ])
    expect(lookup.ids).toEqual(['c1', 'c2'])
    expect(lookup.byId.get('c2')?.type).toBe('group')
  })

  it('dérive les conversations visibles depuis les messages étoilés et déduplique les participants', () => {
    const result = resolveVisibleStarredConversations(
      [
        { _id: 'c1', type: 'direct', participantIds: ['u1', 'u2'], createdAt: '2026-08-20T10:00:00.000Z' },
        { _id: 'c2', type: 'group', participantIds: ['u1', 'u2', 'u3'], createdAt: '2026-08-20T10:00:00.000Z' },
        { _id: 'c3', type: 'direct', participantIds: ['u4', 'u5'], createdAt: '2026-08-20T10:00:00.000Z' },
      ],
      [
        { _id: 'm1', conversationId: 'c2', senderId: 'u1', type: 'text', createdAt: '2026-08-20T10:00:00.000Z' },
        { _id: 'm2', conversationId: 'c1', senderId: 'u2', type: 'text', createdAt: '2026-08-20T10:00:01.000Z' },
      ],
    )

    expect(result.visibleConversations.map((conversation) => String(conversation._id))).toEqual(['c1', 'c2'])
    expect(result.visibleConversationMap.get('c2')?.participantIds).toEqual(['u1', 'u2', 'u3'])
    expect(result.allParticipantIds).toEqual(['u1', 'u2', 'u3'])
  })
})
