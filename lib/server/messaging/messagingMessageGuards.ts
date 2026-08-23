import mongoose, { type HydratedDocument } from 'mongoose'
import Conversation, { type ConversationDoc } from '@/lib/models/Conversation'
import Message, { type MessageDoc } from '@/lib/models/Message'

export type MessageParticipantGuardResult =
  | { ok: false; status: 404; error: 'message_not_found' }
  | { ok: true; message: HydratedDocument<MessageDoc>; conversation: HydratedDocument<ConversationDoc> }

// Garde PARTAGÉE par toute action ciblant un message précis : charge le VRAI
// document Message, résout sa conversation, et vérifie que l'appelant en est
// bien participant. 404 générique dans les deux cas (message inexistant OU
// appelant non participant), même raisonnement que loadParticipantConversation.
export async function loadParticipantMessage(
  messageId: string,
  callerId: string,
): Promise<MessageParticipantGuardResult> {
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }
  const message = await Message.findById(messageId)
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }
  const conversation = await Conversation.findById(message.conversationId)
  if (!conversation || !conversation.participantIds.includes(callerId)) {
    return { ok: false, status: 404, error: 'message_not_found' }
  }
  return { ok: true, message, conversation }
}
