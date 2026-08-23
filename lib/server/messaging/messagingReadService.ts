import Conversation from '@/lib/models/Conversation'
import type { LoadParticipantConversationLike } from './messagingServiceTypes'

export interface MarkConversationReadCaller {
  id: string
}

export interface ConversationIdInput {
  conversationId: string
}

export async function markConversationReadForCaller<TConversation extends { _id: unknown }>(
  caller: MarkConversationReadCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { [`lastReadAt.${caller.id}`]: new Date() } })
  return { ok: true }
}
