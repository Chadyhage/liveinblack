import mongoose, { type HydratedDocument } from 'mongoose'
import Conversation, { type ConversationDoc } from '@/lib/models/Conversation'
import User from '@/lib/models/User'

export interface MessagingCaller {
  id: string
}

export type MessagingErrorResult = { ok: false; status: number; error: string }

export type ConversationGuardResult =
  | MessagingErrorResult
  | {
      ok: true
      conversation: HydratedDocument<ConversationDoc>
    }

export function normalizeObjectId(id: string): string {
  return new mongoose.Types.ObjectId(id).toString()
}

export async function resolveDisplayName(userId: string): Promise<string> {
  const user = await User.findById(userId).lean()
  if (!user) return ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

export async function loadParticipantConversation(
  conversationId: string,
  callerId: string,
): Promise<ConversationGuardResult> {
  if (!mongoose.isValidObjectId(conversationId)) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }

  const conversation = await Conversation.findById(conversationId)
  if (!conversation || !conversation.participantIds.includes(callerId)) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }

  return { ok: true, conversation }
}
