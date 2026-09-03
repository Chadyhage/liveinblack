import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import User from '@/lib/models/User'
import {
  addGroupMemberForCaller,
  removeGroupMemberForCaller,
  setGroupMemberRoleForCaller,
  type GroupMemberDependencies,
} from '../messaging/groupMemberService'

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('groupMemberService', () => {
  const caller = { id: 'u1' }
  type GroupMemberFixture = { userId: string; name: string; role: 'admin' | 'member' }
  type GroupConversationFixture = {
    _id: string
    name: string
    members: GroupMemberFixture[]
    participantIds: string[]
    mutedUserIds: string[]
    memberMuteUntil: Map<string, string>
    toObject: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  const baseConversation = {
    _id: 'conv-1',
    name: 'Groupe test',
    members: [
      { userId: 'u1', name: 'Alice A', role: 'admin' as const },
      { userId: 'u2', name: 'Bob B', role: 'member' as const },
    ],
    participantIds: ['u1', 'u2'],
    mutedUserIds: [],
    memberMuteUntil: new Map<string, string>(),
    toObject: vi.fn(function toObject(this: GroupConversationFixture) {
      return {
        _id: this._id,
        name: this.name,
        members: this.members,
        participantIds: this.participantIds,
        mutedUserIds: this.mutedUserIds,
      }
    }),
    save: vi.fn().mockResolvedValue(undefined),
  } satisfies GroupConversationFixture

  let deps: GroupMemberDependencies

  beforeEach(() => {
    const conversation = structuredClone({
      _id: 'conv-1',
      name: 'Groupe test',
      members: [
        { userId: 'u1', name: 'Alice A', role: 'admin' as const },
        { userId: 'u2', name: 'Bob B', role: 'member' as const },
      ],
      participantIds: ['u1', 'u2'],
      mutedUserIds: [] as string[],
    })

    deps = {
      normalizeObjectId: vi.fn((id: string) => id.toLowerCase()),
      loadGroupAsAdmin: vi.fn().mockResolvedValue({
        ok: true,
        conversation: {
          ...baseConversation,
          ...conversation,
          memberMuteUntil: new Map<string, string>(),
          toObject: vi.fn(() => conversation),
          save: vi.fn().mockResolvedValue(undefined),
        },
        members: conversation.members as GroupMemberFixture[],
      }),
      resolveDisplayName: vi.fn().mockResolvedValue('Alice A'),
      appendGroupSystemMessage: vi.fn().mockResolvedValue(undefined),
      notifyUserById: vi.fn().mockResolvedValue(undefined),
      addedToGroupEmail: vi.fn().mockResolvedValue({ subject: 'email' }),
      toConversationView: vi.fn((conversationLike) => ({
        id: String((conversationLike as { _id: string })._id),
        name: (conversationLike as { name: string }).name,
        type: 'group',
        participantIds: (conversationLike as { participantIds: string[] }).participantIds,
        members: (conversationLike as { members: GroupMemberFixture[] }).members,
      }) as never),
      maxMembersTotal: 3,
      site: 'https://liveinblack.com',
    }
    vi.clearAllMocks()
  })

  it('refuse un ajout avec userId invalide', async () => {
    await expect(
      addGroupMemberForCaller(caller, { conversationId: 'conv-1', userId: 'bad-id' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'user_not_found',
    })
  })

  it('ajoute un membre, journalise le système et notifie', async () => {
    const userId = new mongoose.Types.ObjectId().toString()
    vi.mocked(User.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: userId,
        firstName: 'Chris',
        lastName: 'C',
        email: 'chris@test.com',
      }),
    } as never)

    const result = await addGroupMemberForCaller(caller, { conversationId: 'conv-1', userId }, deps)

    expect(result.ok).toBe(true)
    expect(deps.normalizeObjectId).toHaveBeenCalledWith(userId)
    expect(deps.appendGroupSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conv-1' }),
      {
        senderId: 'u1',
        senderName: 'Alice A',
        content: 'Alice A a ajouté Chris C',
      },
    )
    expect(deps.notifyUserById).toHaveBeenCalledTimes(1)
  })

  it('refuse de retirer soi-même via removeMember', async () => {
    await expect(
      removeGroupMemberForCaller(caller, { conversationId: 'conv-1', userId: 'u1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'cannot_remove_self',
    })
  })

  it('retire un membre et nettoie sa sourdine résiduelle', async () => {
    vi.mocked(deps.loadGroupAsAdmin).mockResolvedValueOnce({
      ok: true,
      conversation: {
        ...baseConversation,
        mutedUserIds: ['u2'],
        memberMuteUntil: new Map([['u2', '']]),
        save: vi.fn().mockResolvedValue(undefined),
      } as GroupConversationFixture,
      members: [
        { userId: 'u1', name: 'Alice A', role: 'admin' as const },
        { userId: 'u2', name: 'Bob B', role: 'member' as const },
      ] as GroupMemberFixture[],
    } as never)

    const result = await removeGroupMemberForCaller(caller, { conversationId: 'conv-1', userId: 'u2' }, deps)

    expect(result).toEqual({ ok: true })
    expect(deps.appendGroupSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conv-1' }),
      {
        senderId: 'u1',
        senderName: 'Alice A',
        content: 'Bob B a été retiré du groupe',
      },
    )
  })

  it('empêche de retirer le dernier admin', async () => {
    const result = await setGroupMemberRoleForCaller(
      caller,
      { conversationId: 'conv-1', userId: 'u1', role: 'member' },
      deps,
    )

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'only_admin',
    })
  })

  it('promeut un membre admin et écrit le message système', async () => {
    const result = await setGroupMemberRoleForCaller(
      caller,
      { conversationId: 'conv-1', userId: 'u2', role: 'admin' },
      deps,
    )

    expect(result).toEqual({ ok: true })
    expect(deps.appendGroupSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conv-1' }),
      {
        senderId: 'u1',
        senderName: 'Alice A',
        content: 'Alice A a nommé Bob B administrateur',
      },
    )
  })
})
