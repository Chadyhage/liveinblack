import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import {
  pinGroupMessageForCaller,
  renameGroupForCaller,
  setGroupAvatarForCaller,
  unpinGroupMessageForCaller,
  type GroupAdminDependencies,
} from '../groupAdminToolsService'

vi.mock('../../models/Conversation', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}))

describe('groupAdminToolsService', () => {
  const caller = { id: 'u1' }
  const conversation = {
    _id: 'conv-1',
    name: 'Groupe test',
    pinnedMessageId: '507f1f77bcf86cd799439012',
    save: vi.fn().mockResolvedValue(undefined),
  }

  let deps: GroupAdminDependencies

  beforeEach(() => {
    vi.clearAllMocks()
    deps = {
      loadGroupAsAdmin: vi.fn().mockResolvedValue({ ok: true, conversation: { ...conversation } }),
      resolveDisplayName: vi.fn().mockResolvedValue('Alice A'),
      appendGroupSystemMessage: vi.fn().mockResolvedValue(undefined),
      uploadDataUri: vi.fn().mockResolvedValue({ ok: true, url: 'https://cdn.test/groups/conv-1/avatar.jpg' }),
      imageMimeTypes: ['image/jpeg'],
      maxGroupNameLength: 100,
    }
  })

  it('refuse un renommage vide', async () => {
    await expect(
      renameGroupForCaller(caller, { conversationId: 'conv-1', name: '   ' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'group_name_required',
    })
  })

  it('renomme le groupe et journalise le message système', async () => {
    const result = await renameGroupForCaller(caller, { conversationId: 'conv-1', name: 'Nouveau nom' }, deps)

    expect(result).toEqual({ ok: true, name: 'Nouveau nom' })
    expect(deps.appendGroupSystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conv-1', name: 'Nouveau nom' }),
      {
        senderId: 'u1',
        senderName: 'Alice A',
        content: 'Alice A a renommé le groupe en "Nouveau nom"',
      },
    )
  })

  it('upload un avatar avec le bon dossier', async () => {
    const result = await setGroupAvatarForCaller(
      caller,
      { conversationId: 'conv-1', dataUri: 'data:image/jpeg;base64,AAA' },
      deps,
    )

    expect(result).toEqual({ ok: true, avatar: 'https://cdn.test/groups/conv-1/avatar.jpg' })
    expect(deps.uploadDataUri).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAA',
      'groups/conv-1',
      { allowedMimeTypes: ['image/jpeg'] },
    )
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'conv-1' },
      { $set: { avatar: 'https://cdn.test/groups/conv-1/avatar.jpg' } },
    )
  })

  it('refuse un pin avec messageId invalide', async () => {
    await expect(
      pinGroupMessageForCaller(caller, { conversationId: 'conv-1', messageId: 'bad-id' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    })
  })

  it('épingle un message existant du groupe', async () => {
    const messageId = new mongoose.Types.ObjectId().toString()
    vi.mocked(Message.findOne).mockResolvedValueOnce({ _id: messageId } as never)

    const result = await pinGroupMessageForCaller(caller, { conversationId: 'conv-1', messageId }, deps)

    expect(result).toEqual({ ok: true })
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'conv-1' },
      { $set: { pinnedMessageId: messageId } },
    )
    expect(Message.updateOne).toHaveBeenCalledWith(
      { _id: messageId },
      { $set: { pinned: true } },
    )
  })

  it('désépingle le message courant quand il existe', async () => {
    const result = await unpinGroupMessageForCaller(caller, { conversationId: 'conv-1' }, deps)

    expect(result).toEqual({ ok: true })
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'conv-1' },
      { $set: { pinnedMessageId: null } },
    )
    expect(Message.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439012' },
      { $set: { pinned: false } },
    )
  })
})
