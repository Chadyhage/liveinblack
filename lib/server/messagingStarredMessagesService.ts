import Conversation from '../models/Conversation'
import Message from '../models/Message'
import {
  buildConversationLookup,
  normalizeStarredPagination,
  resolveVisibleStarredConversations,
} from './messagingStarredUtils'
import { toMessageView, type ConversationSource, type MessageSource, type MessageView } from './messagingViews'

export interface StarredMessagesCaller {
  id: string
}

export interface ListStarredMessagesParams {
  page?: number
  pageSize?: number
}

export interface ListStarredMessagesResult {
  ok: true
  messages: MessageView[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export async function listStarredMessagesPage(
  caller: StarredMessagesCaller,
  params: ListStarredMessagesParams,
  resolveReadReceiptsAllowed: (participantIds: string[]) => Promise<Map<string, boolean>>,
): Promise<ListStarredMessagesResult> {
  const { page: safePage, pageSize: safePageSize, skip } = normalizeStarredPagination(params)

  const conversations = (await Conversation.find({ participantIds: caller.id })
    .select('type participantIds lastReadAt')
    .lean()) as unknown as ConversationSource[]
  if (conversations.length === 0) {
    return {
      ok: true,
      messages: [],
      page: safePage,
      pageSize: safePageSize,
      total: 0,
      hasMore: false,
    }
  }

  const convLookup = buildConversationLookup(conversations)
  const filter = {
    conversationId: { $in: convLookup.ids },
    starredByUserIds: caller.id,
    deletedForUserIds: { $ne: caller.id },
  }

  const totalPromise = Message.countDocuments(filter)
  const docsPromise = Message.find(filter)
    .select('conversationId senderId senderName type content poll reactions readBy deletedForAll pinned replyToMessageId createdAt editedAt starredByUserIds forwardedFrom')
    .sort({ _id: -1 })
    .skip(skip)
    .limit(safePageSize + 1)
    .lean()

  const [rawRows, total] = await Promise.all([docsPromise, totalPromise])
  const rows = rawRows as unknown as MessageSource[]
  const hasMore = rows.length > safePageSize
  const pageRows = hasMore ? rows.slice(0, safePageSize) : rows
  const { visibleConversationMap, allParticipantIds } = resolveVisibleStarredConversations(conversations, rows)
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(allParticipantIds)

  const messages = pageRows
    .map((message) => {
      const conversation = visibleConversationMap.get(message.conversationId) || convLookup.byId.get(message.conversationId)
      if (!conversation) return null
      return toMessageView(message, { callerId: caller.id, conversation, readReceiptsAllowed })
    })
    .filter((message): message is MessageView => message !== null)

  return {
    ok: true,
    messages,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore,
  }
}
