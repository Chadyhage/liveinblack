import Conversation from '../models/Conversation'
import { buildTypingUsers, collectActiveTypingUserIds } from './messagingTypingUtils'
import type { LoadParticipantConversationLike } from './messagingServiceTypes'

export interface TypingCaller {
  id: string
}

export interface ConversationIdInput {
  conversationId: string
}

export interface SetTypingInput extends ConversationIdInput {
  typing: boolean
}

export interface TypingUserView {
  userId: string
  name: string
}

const TYPING_TTL_MS = 5_000

export async function setConversationTypingState<TConversation extends { _id: unknown }>(
  caller: TypingCaller,
  input: SetTypingInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  if (input.typing) {
    await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { [`typingAt.${caller.id}`]: new Date() } })
  } else {
    await Conversation.updateOne({ _id: guard.conversation._id }, { $unset: { [`typingAt.${caller.id}`]: '' } })
  }
  return { ok: true }
}

export async function listConversationTypingUsers<
  TConversation extends {
    type: 'direct' | 'group'
    members?: Array<{ userId: string; name?: string | null }> | null
    typingAt?: unknown
  },
>(
  caller: TypingCaller,
  input: ConversationIdInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
  resolveDirectMemberNames: (participantIds: string[]) => Promise<Map<string, string>>,
): Promise<{ ok: true; users: TypingUserView[] } | { ok: false; status: number; error: string }> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  const conversation = guard.conversation
  const typingAtRaw = conversation.typingAt as Map<string, Date | string> | Record<string, Date | string> | undefined
  const activeUserIds = collectActiveTypingUserIds(typingAtRaw, caller.id, TYPING_TTL_MS)
  if (activeUserIds.length === 0) return { ok: true, users: [] }

  let names: Map<string, string>
  if (conversation.type === 'group' && conversation.members) {
    names = new Map(conversation.members.map((member) => [member.userId, member.name || '']))
  } else {
    names = await resolveDirectMemberNames(activeUserIds)
  }

  return { ok: true, users: buildTypingUsers(activeUserIds, names) }
}
