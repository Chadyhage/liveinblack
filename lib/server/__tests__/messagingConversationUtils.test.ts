import { describe, expect, it } from 'vitest'
import { collectDirectParticipantIds, withDirectConversationMembers } from '../messaging/messagingConversationUtils'

describe('messagingConversationUtils', () => {
  it('collecte uniquement les participants des conversations directes, sans doublons', () => {
    expect(
      collectDirectParticipantIds([
        { type: 'direct', participantIds: ['u1', 'u2'] },
        { type: 'group', participantIds: ['u2', 'u3', 'u4'] },
        { type: 'direct', participantIds: ['u2', 'u5'] },
      ])
    ).toEqual(['u1', 'u2', 'u5'])
  })

  it('hydrate les membres d’une conversation directe à partir de la map des noms', () => {
    expect(
      withDirectConversationMembers(
        {
          id: 'conv-1',
          type: 'direct',
          participantIds: ['u1', 'u2'],
          members: [],
          name: null,
          avatar: null,
          mutedUserIds: [],
          lastMessage: '',
          lastMessageAt: null,
          lastSenderId: null,
          pinnedMessageId: null,
          createdAt: '2026-08-20T10:00:00.000Z',
        },
        new Map([
          ['u1', 'Alice A'],
          ['u2', 'Bob B'],
        ])
      )
    ).toMatchObject({
      members: [
        { userId: 'u1', name: 'Alice A', role: 'member' },
        { userId: 'u2', name: 'Bob B', role: 'member' },
      ],
    })
  })

  it('garde des noms vides quand un participant n’a pas de résolution', () => {
    expect(
      withDirectConversationMembers(
        {
          id: 'conv-2',
          type: 'direct',
          participantIds: ['u1', 'u9'],
          members: [],
          name: null,
          avatar: null,
          mutedUserIds: [],
          lastMessage: '',
          lastMessageAt: null,
          lastSenderId: null,
          pinnedMessageId: null,
          createdAt: '2026-08-20T10:00:00.000Z',
        },
        new Map([['u1', 'Alice A']])
      )
    ).toMatchObject({
      members: [
        { userId: 'u1', name: 'Alice A', role: 'member' },
        { userId: 'u9', name: '', role: 'member' },
      ],
    })
  })
})
