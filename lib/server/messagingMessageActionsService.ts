import Message from '../models/Message'
import type {
  LoadParticipantMessageLike,
} from './messagingServiceTypes'

export interface MessageActionCaller {
  id: string
}

export interface MessageIdInput {
  messageId: string
}

export async function deleteMessageForCaller<
  TMessage extends { _id: unknown },
  TConversation,
>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  await Message.updateOne({ _id: guard.message._id }, { $addToSet: { deletedForUserIds: caller.id } })
  return { ok: true }
}

export async function deleteMessageForEveryone<
  TMessage extends { _id: unknown; senderId: string },
  TConversation,
>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard
  if (guard.message.senderId !== caller.id) return { ok: false, status: 403, error: 'not_message_owner' }

  await Message.updateOne({ _id: guard.message._id }, { $set: { deletedForAll: true, content: null, poll: null } })
  return { ok: true }
}

export async function starMessageForCaller<
  TMessage extends { _id: unknown },
  TConversation,
>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>,
): Promise<{ ok: true; starred: true } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  await Message.updateOne({ _id: guard.message._id }, { $addToSet: { starredByUserIds: caller.id } })
  return { ok: true, starred: true }
}

export async function unstarMessageForCaller<
  TMessage extends { _id: unknown },
  TConversation,
>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>,
): Promise<{ ok: true; starred: false } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  await Message.updateOne({ _id: guard.message._id }, { $pull: { starredByUserIds: caller.id } })
  return { ok: true, starred: false }
}
