import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import { listConversationsForCaller } from '../messaging/messagingConversationListService'

vi.mock('../../models/Conversation', () => ({
  default: {
    aggregate: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    aggregate: vi.fn(),
  },
}))

describe('messagingConversationListService', () => {
  const caller = { id: 'u1' }
  const resolveDirectMemberNames = vi.fn()
  const toConversationView = vi.fn((conversation: Record<string, unknown>) => ({
    id: String(conversation._id),
    type: conversation.type as 'direct' | 'group',
    participantIds: conversation.participantIds as string[],
    members: ((conversation.members as Array<Record<string, unknown>> | undefined) ?? []).map((member) => ({
      userId: String(member.userId),
      name: String(member.name),
      role: (member.role as 'member' | 'admin') ?? 'member',
      ...(member.muteUntilAt ? { muteUntilAt: String(member.muteUntilAt) } : {}),
    })),
    unreadCount: 0,
    pinned: false,
    mutedForMe: false,
    myGroupMute: null,
  }))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hydrate les membres directs, unreadCount et drapeaux personnels', async () => {
    vi.mocked(Conversation.aggregate).mockResolvedValueOnce([
      {
        items: [
          {
            _id: 'conv-1',
            type: 'direct',
            participantIds: ['u1', 'u2'],
            members: [],
            createdAt: '2026-08-20T10:00:00.000Z',
            lastReadAt: {},
            pinnedByUserIds: ['u1'],
            mutedConversationByUserIds: ['u1'],
          },
        ],
        total: [{ value: 1 }],
      },
    ] as never)
    resolveDirectMemberNames.mockResolvedValueOnce(
      new Map([
        ['u1', 'Alice A'],
        ['u2', 'Bob B'],
      ])
    )
    vi.mocked(Message.aggregate).mockResolvedValueOnce([{ _id: 'conv-1', unreadCount: 3 }] as never)

    const result = await listConversationsForCaller(caller, {}, { toConversationView, resolveDirectMemberNames })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0]).toMatchObject({
      id: 'conv-1',
      unreadCount: 3,
      pinned: true,
      mutedForMe: true,
      myGroupMute: null,
      members: [
        { userId: 'u1', name: 'Alice A', role: 'member' },
        { userId: 'u2', name: 'Bob B', role: 'member' },
      ],
    })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('hydrate la sourdine de groupe pour les membres et pour l’appelant', async () => {
    vi.mocked(Conversation.aggregate).mockResolvedValueOnce([
      {
        items: [
          {
            _id: 'group-1',
            type: 'group',
            participantIds: ['u1', 'u2'],
            members: [
              { userId: 'u1', name: 'Alice A', role: 'admin' },
              { userId: 'u2', name: 'Bob B', role: 'member' },
            ],
            createdAt: '2026-08-20T10:00:00.000Z',
            lastReadAt: {},
            mutedUserIds: ['u2'],
            memberMuteUntil: { u1: '', u2: '2026-08-21T08:00:00.000Z' },
            pinnedByUserIds: [],
            mutedConversationByUserIds: [],
          },
        ],
        total: [{ value: 1 }],
      },
    ] as never)
    resolveDirectMemberNames.mockResolvedValueOnce(new Map())
    vi.mocked(Message.aggregate).mockResolvedValueOnce([] as never)

    const result = await listConversationsForCaller(caller, {}, { toConversationView, resolveDirectMemberNames })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversations[0].members).toEqual([
      { userId: 'u1', name: 'Alice A', role: 'admin', muteUntilAt: null },
      { userId: 'u2', name: 'Bob B', role: 'member', muteUntilAt: '2026-08-21T08:00:00.000Z' },
    ])
    expect(result.conversations[0].myGroupMute).toEqual({ untilAt: null })
  })

  it('calcule hasMore selon page et pageSize', async () => {
    vi.mocked(Conversation.aggregate).mockResolvedValueOnce([
      {
        items: [
          {
            _id: 'conv-1',
            type: 'direct',
            participantIds: ['u1', 'u2'],
            members: [],
            createdAt: '2026-08-20T10:00:00.000Z',
            lastReadAt: {},
            pinnedByUserIds: [],
            mutedConversationByUserIds: [],
          },
        ],
        total: [{ value: 6 }],
      },
    ] as never)
    resolveDirectMemberNames.mockResolvedValueOnce(new Map())
    vi.mocked(Message.aggregate).mockResolvedValueOnce([] as never)

    const result = await listConversationsForCaller(caller, { page: 2, pageSize: 5 }, { toConversationView, resolveDirectMemberNames })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(5)
    expect(result.hasMore).toBe(false)
  })
})
