import mongoose from 'mongoose'
import Message from '@/lib/models/Message'
import type { LoadParticipantConversationLike } from './messagingServiceTypes'

export interface MessagesCaller {
  id: string
}

export interface GetMessagesInput {
  conversationId: string
  before?: string
  limit?: number
}

export interface MessageViewLike {
  id: string
}

export type MessagesResult<TMessageView> =
  | { ok: false; status: number; error: string }
  | { ok: true; messages: TMessageView[]; hasMore: boolean }

export interface GetMessagesDependencies<TConversationSource, TMessageSource, TMessageView> {
  loadParticipantConversation: LoadParticipantConversationLike<TConversationSource>
  toMessageView: (
    message: TMessageSource,
    ctx: {
      callerId: string
      conversation: TConversationSource
      readReceiptsAllowed: Map<string, boolean>
    },
  ) => TMessageView
  resolveReadReceiptsAllowed: (participantIds: string[]) => Promise<Map<string, boolean>>
  defaultLimit?: number
  maxLimit?: number
}

export async function listMessagesForCaller<
  TConversationSource extends {
    participantIds?: string[]
  },
  TMessageSource,
  TMessageView,
>(
  caller: MessagesCaller,
  input: GetMessagesInput,
  {
    loadParticipantConversation,
    toMessageView,
    resolveReadReceiptsAllowed,
    defaultLimit = 30,
    maxLimit = 100,
  }: GetMessagesDependencies<TConversationSource, TMessageSource, TMessageView>,
): Promise<MessagesResult<TMessageView>> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  let limit = Math.floor(input.limit ?? defaultLimit)
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit
  if (limit > maxLimit) limit = maxLimit

  const query: Record<string, unknown> = {
    conversationId,
    deletedForUserIds: { $ne: caller.id },
  }
  if (input.before) {
    if (!mongoose.isValidObjectId(input.before)) return { ok: false, status: 400, error: 'invalid_cursor' }
    query._id = { $lt: new mongoose.Types.ObjectId(input.before) }
  }

  const docs = (await Message.find(query)
    .select(
      'conversationId senderId senderName type content poll reactions readBy deletedForAll pinned replyToMessageId createdAt editedAt starredByUserIds forwardedFrom',
    )
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()) as TMessageSource[]

  const hasMore = docs.length > limit
  const page = docs.slice(0, limit).reverse()
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(guard.conversation.participantIds ?? [])

  return {
    ok: true,
    messages: page.map((message) =>
      toMessageView(message, {
        callerId: caller.id,
        conversation: guard.conversation,
        readReceiptsAllowed,
      }),
    ),
    hasMore,
  }
}
