import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import type { LoadParticipantConversationLike } from './messagingServiceTypes'

export interface ConversationPreferenceCaller {
  id: string
}

export interface ConversationIdInput {
  conversationId: string
}

async function withParticipantConversation<TConversation>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
  run: (conversationId: string, conversation: TConversation) => Promise<void>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  await run(conversationId, guard.conversation)
  return { ok: true }
}

export async function pinConversationForCaller<TConversation extends { _id: unknown }>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (_conversationId, conversation) => {
    await Conversation.updateOne({ _id: conversation._id }, { $addToSet: { pinnedByUserIds: caller.id } })
  })
}

export async function unpinConversationForCaller<TConversation extends { _id: unknown }>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (_conversationId, conversation) => {
    await Conversation.updateOne({ _id: conversation._id }, { $pull: { pinnedByUserIds: caller.id } })
  })
}

export async function muteConversationForCaller<TConversation extends { _id: unknown }>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (_conversationId, conversation) => {
    await Conversation.updateOne({ _id: conversation._id }, { $addToSet: { mutedConversationByUserIds: caller.id } })
  })
}

export async function unmuteConversationForCaller<TConversation extends { _id: unknown }>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (_conversationId, conversation) => {
    await Conversation.updateOne({ _id: conversation._id }, { $pull: { mutedConversationByUserIds: caller.id } })
  })
}

export async function hideConversationForCaller<TConversation extends { _id: unknown }>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (_conversationId, conversation) => {
    await Conversation.updateOne({ _id: conversation._id }, { $addToSet: { hiddenByUserIds: caller.id } })
  })
}

export async function clearConversationHistoryForCaller<TConversation>(
  caller: ConversationPreferenceCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return withParticipantConversation(caller, input, loadParticipantConversation, async (conversationId) => {
    await Message.updateMany({ conversationId, deletedForUserIds: { $ne: caller.id } }, { $addToSet: { deletedForUserIds: caller.id } })
  })
}
