import mongoose from 'mongoose'
import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'

export interface ReactToMessageInput {
  messageId: string
  emoji: string
}

export interface ReactionCaller {
  id: string
}

export async function toggleMessageReaction(
  caller: ReactionCaller,
  input: ReactToMessageInput,
  deps: {
    validateReactionEmoji: (emoji: string) => { ok: true; emoji: string } | { ok: false; error: string }
    buildReactionTogglePipeline: (callerId: string, emoji: string) => unknown[]
    normalizeReactionMap: (value: unknown) => Record<string, string[]>
  },
): Promise<{ ok: true; reactions: Record<string, string[]> } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  const emojiResult = deps.validateReactionEmoji(input.emoji)
  if (!messageId || !emojiResult.ok) {
    return { ok: false, status: 400, error: emojiResult.ok ? 'invalid_input' : emojiResult.error }
  }

  const emoji = emojiResult.emoji
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }

  const message = await Message.findById(messageId).lean()
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }

  const conversation = await Conversation.findById(message.conversationId).lean()
  if (!conversation || !conversation.participantIds.includes(caller.id)) {
    return { ok: false, status: 404, error: 'message_not_found' }
  }

  await Message.updateOne({ _id: message._id }, deps.buildReactionTogglePipeline(caller.id, emoji), { updatePipeline: true })
  const updated = await Message.findById(message._id).lean()
  return { ok: true, reactions: deps.normalizeReactionMap(updated?.reactions) }
}
