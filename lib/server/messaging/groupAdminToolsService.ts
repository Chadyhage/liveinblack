import mongoose from 'mongoose'
import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import type { MessagingCaller } from './messagingCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

export interface GroupConversationIdInput {
  conversationId: string
}

export interface RenameGroupInput extends GroupConversationIdInput {
  name: string
}

export interface SetGroupAvatarInput extends GroupConversationIdInput {
  dataUri: string
}

export interface PinMessageInput extends GroupConversationIdInput {
  messageId: string
}

export type RenameGroupResult = MessagingErrorResult | { ok: true; name: string }
export type SetGroupAvatarResult = MessagingErrorResult | { ok: true; avatar: string }
export type PinMessageResult = MessagingErrorResult | { ok: true }

export interface GroupAdminConversationGuard {
  ok: true
  conversation: {
    _id: unknown
    name?: string | null
    pinnedMessageId?: string | null
    save?: () => Promise<unknown>
  }
}

export interface GroupAdminDependencies {
  loadGroupAsAdmin: (
    caller: MessagingCaller,
    conversationId: string,
  ) => Promise<MessagingErrorResult | GroupAdminConversationGuard>
  resolveDisplayName: (userId: string) => Promise<string>
  appendGroupSystemMessage: (
    conversation: any,
    input: {
      senderId: string
      senderName: string
      content: string
    },
  ) => Promise<void>
  uploadDataUri: (
    dataUri: string,
    folder: string,
    options: { allowedMimeTypes: readonly string[] | string[] },
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  imageMimeTypes: readonly string[] | string[]
  maxGroupNameLength: number
}

export async function renameGroupForCaller(
  caller: MessagingCaller,
  input: RenameGroupInput,
  {
    loadGroupAsAdmin,
    resolveDisplayName,
    appendGroupSystemMessage,
    maxGroupNameLength,
  }: Pick<GroupAdminDependencies, 'loadGroupAsAdmin' | 'resolveDisplayName' | 'appendGroupSystemMessage' | 'maxGroupNameLength'>,
): Promise<RenameGroupResult> {
  const conversationId = input.conversationId?.trim()
  const name = input.name?.trim()
  if (!conversationId || !name) return { ok: false, status: 400, error: 'group_name_required' }
  if (name.length > maxGroupNameLength) return { ok: false, status: 400, error: 'group_name_too_long' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation } = guard
  if (conversation.name === name) return { ok: true, name }

  conversation.name = name
  const callerName = await resolveDisplayName(caller.id)
  await appendGroupSystemMessage(conversation, {
    senderId: caller.id,
    senderName: callerName,
    content: `${callerName} a renommé le groupe en "${name}"`,
  })
  await conversation.save?.()
  return { ok: true, name }
}

export async function setGroupAvatarForCaller(
  caller: MessagingCaller,
  input: SetGroupAvatarInput,
  {
    loadGroupAsAdmin,
    uploadDataUri,
    imageMimeTypes,
  }: Pick<GroupAdminDependencies, 'loadGroupAsAdmin' | 'uploadDataUri' | 'imageMimeTypes'>,
): Promise<SetGroupAvatarResult> {
  const conversationId = input.conversationId?.trim()
  const dataUri = input.dataUri
  if (!conversationId || !dataUri) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const uploaded = await uploadDataUri(dataUri, `groups/${String(guard.conversation._id)}`, {
    allowedMimeTypes: imageMimeTypes,
  })
  if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }

  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { avatar: uploaded.url } })
  return { ok: true, avatar: uploaded.url }
}

export async function pinGroupMessageForCaller(
  caller: MessagingCaller,
  input: PinMessageInput,
  {
    loadGroupAsAdmin,
  }: Pick<GroupAdminDependencies, 'loadGroupAsAdmin'>,
): Promise<PinMessageResult> {
  const conversationId = input.conversationId?.trim()
  const messageId = input.messageId?.trim()
  if (!conversationId || !messageId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const message = await Message.findOne({ _id: messageId, conversationId })
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }

  await Promise.all([
    Conversation.updateOne({ _id: guard.conversation._id }, { $set: { pinnedMessageId: String(message._id) } }),
    Message.updateOne({ _id: message._id }, { $set: { pinned: true } }),
  ])
  return { ok: true }
}

export async function unpinGroupMessageForCaller(
  caller: MessagingCaller,
  input: GroupConversationIdInput,
  {
    loadGroupAsAdmin,
  }: Pick<GroupAdminDependencies, 'loadGroupAsAdmin'>,
): Promise<PinMessageResult> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard

  const pinnedId = guard.conversation.pinnedMessageId
  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { pinnedMessageId: null } })
  if (pinnedId) await Message.updateOne({ _id: pinnedId }, { $set: { pinned: false } })
  return { ok: true }
}
