import type { HydratedDocument, ClientSession } from 'mongoose'
import Message from '@/lib/models/Message'
import type { ConversationDoc } from '@/lib/models/Conversation'

export interface AppendGroupSystemMessageInput {
  senderId: string
  senderName: string
  content: string
}

export interface AppendGroupSystemMessageOptions {
  session?: ClientSession
}

export async function appendGroupSystemMessage(
  conversation: HydratedDocument<ConversationDoc>,
  input: AppendGroupSystemMessageInput,
  options: AppendGroupSystemMessageOptions = {},
): Promise<void> {
  const createPayload = {
    conversationId: String(conversation._id),
    senderId: input.senderId,
    senderName: input.senderName,
    type: 'system' as const,
    content: input.content,
  }

  const created = options.session
    ? await Message.create([createPayload], { session: options.session }).then(([message]) => message)
    : await Message.create(createPayload)

  conversation.lastMessage = input.content
  conversation.lastMessageAt = created.createdAt as unknown as Date
  conversation.lastSenderId = input.senderId
}
