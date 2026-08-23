import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Conversation from '@/lib/models/Conversation'
import User from '@/lib/models/User'
import { createDirectConversationForCaller } from '../messaging/messagingDirectConversationService'

vi.mock('../../models/Conversation', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
    base: {
      mongoose: {
        isValidObjectId: vi.fn((value: string) => mongoose.isValidObjectId(value)),
      },
    },
  },
}))

describe('messagingDirectConversationService', () => {
  const caller = { id: '507f1f77bcf86cd799439011' }
  const otherId = '507f1f77bcf86cd799439012'
  const names = new Map([
    [caller.id, 'Alice A'],
    [otherId, 'Bob B'],
  ])

  const normalizeObjectId = vi.fn((id: string) => new mongoose.Types.ObjectId(id).toString())
  const toConversationView = vi.fn((conversation: { _id?: string; type: 'direct'; participantIds: string[] }) => ({
    id: conversation._id ?? 'conv-1',
    type: 'direct' as const,
    participantIds: conversation.participantIds,
    members: [],
  }))
  const withDirectConversationMembers = vi.fn((conversation, directNames: Map<string, string>) => ({
    ...conversation,
    members: conversation.participantIds.map((userId) => ({
      userId,
      name: directNames.get(userId) ?? '',
      role: 'member' as const,
    })),
  }))
  const resolveDirectMemberNames = vi.fn().mockResolvedValue(names)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un identifiant vide', async () => {
    await expect(
      createDirectConversationForCaller(caller, { otherUserId: '   ' }, {
        normalizeObjectId,
        toConversationView,
        withDirectConversationMembers,
        resolveDirectMemberNames,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('retrouve la conversation existante sans en recréer', async () => {
    vi.mocked(User.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: otherId, blockedUserIds: [] }) } as never)
    vi.mocked(Conversation.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'conv-existing', type: 'direct', participantIds: [caller.id, otherId] }),
    } as never)

    const result = await createDirectConversationForCaller(caller, { otherUserId: otherId }, {
      normalizeObjectId,
      toConversationView,
      withDirectConversationMembers,
      resolveDirectMemberNames,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversation.id).toBe('conv-existing')
    expect(Conversation.create).not.toHaveBeenCalled()
    expect(resolveDirectMemberNames).toHaveBeenCalledWith([caller.id, otherId])
  })

  it('refuse un contact bloqué avant création', async () => {
    vi.mocked(User.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: otherId, blockedUserIds: [] }) } as never)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: caller.id, blockedUserIds: [otherId] }) } as never)
    vi.mocked(Conversation.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never)

    await expect(
      createDirectConversationForCaller(caller, { otherUserId: otherId }, {
        normalizeObjectId,
        toConversationView,
        withDirectConversationMembers,
        resolveDirectMemberNames,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'blocked',
    })
  })

  it('crée la conversation puis hydrate les membres directs', async () => {
    vi.mocked(User.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: otherId, blockedUserIds: [] }) } as never)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: caller.id, blockedUserIds: [] }) } as never)
    vi.mocked(Conversation.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never)
    vi.mocked(Conversation.create).mockResolvedValue({
      toObject: vi.fn().mockReturnValue({ _id: 'conv-created', type: 'direct', participantIds: [caller.id, otherId] }),
    } as never)

    const result = await createDirectConversationForCaller(caller, { otherUserId: otherId }, {
      normalizeObjectId,
      toConversationView,
      withDirectConversationMembers,
      resolveDirectMemberNames,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Conversation.create).toHaveBeenCalledWith({ type: 'direct', participantIds: [caller.id, otherId] })
    expect(result.conversation.members).toEqual([
      { userId: caller.id, name: 'Alice A', role: 'member' },
      { userId: otherId, name: 'Bob B', role: 'member' },
    ])
  })
})
