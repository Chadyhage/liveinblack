import type { ConversationSource, MessageSource } from './messagingViews'

export interface StarredPagination {
  page: number
  pageSize: number
  skip: number
}

export function normalizeStarredPagination(params: { page?: number; pageSize?: number } = {}): StarredPagination {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize) || 50))
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  }
}

export function buildConversationLookup(conversations: ConversationSource[]): {
  byId: Map<string, ConversationSource>
  ids: string[]
} {
  const byId = new Map(conversations.map((conversation) => [String(conversation._id), conversation] as const))
  return {
    byId,
    ids: [...byId.keys()],
  }
}

export function resolveVisibleStarredConversations(
  conversations: ConversationSource[],
  rows: MessageSource[],
): {
  visibleConversations: ConversationSource[]
  visibleConversationMap: Map<string, ConversationSource>
  allParticipantIds: string[]
} {
  const visibleConversationIds = new Set(rows.map((row) => String(row.conversationId)))
  const visibleConversations = conversations.filter((conversation) => visibleConversationIds.has(String(conversation._id)))
  const visibleConversationMap = new Map(
    visibleConversations.map((conversation) => [String(conversation._id), conversation] as const),
  )
  const allParticipantIds = [...new Set(visibleConversations.flatMap((conversation) => conversation.participantIds ?? []))]
  return {
    visibleConversations,
    visibleConversationMap,
    allParticipantIds,
  }
}
