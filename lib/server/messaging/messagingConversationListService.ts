import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import { collectDirectParticipantIds, withDirectConversationMembers } from './messagingConversationUtils'
import { resolveMemberMuteStatus } from './messagingMuteUtils'

export interface ConversationListCaller {
  id: string
}

export interface ConversationListInput {
  page?: number
  pageSize?: number
}

export interface ConversationListView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: Array<{
    userId: string
    name: string
    role: 'member' | 'admin'
    muteUntilAt?: string | null
  }>
  unreadCount: number
  pinned: boolean
  mutedForMe: boolean
  myGroupMute: { untilAt: string | null } | null
}

export interface ConversationListPageMeta {
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type ConversationListResult<TConversationListView extends ConversationListView> =
  | { ok: false; status: number; error: string }
  | ({ ok: true; conversations: TConversationListView[] } & ConversationListPageMeta)

export interface ConversationListDependencies<TConversationSource, TConversationView extends ConversationListView> {
  toConversationView: (conversation: TConversationSource) => TConversationView
  resolveDirectMemberNames: (participantIds: string[]) => Promise<Map<string, string>>
}

export async function listConversationsForCaller<
  TConversationSource extends {
    _id: unknown
    type: 'direct' | 'group'
    participantIds: string[]
    createdAt: string | Date
    lastReadAt?: Record<string, string | Date> | Map<string, string | Date>
    pinnedByUserIds?: string[]
    mutedConversationByUserIds?: string[]
  },
  TConversationView extends ConversationListView,
>(
  caller: ConversationListCaller,
  input: ConversationListInput,
  {
    toConversationView,
    resolveDirectMemberNames,
  }: ConversationListDependencies<TConversationSource, TConversationView>,
): Promise<ConversationListResult<TConversationView>> {
  const page = Number.isFinite(Number(input.page)) ? Math.max(1, Math.floor(Number(input.page))) : 1
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(input.pageSize) || 20)))
  const skip = (page - 1) * pageSize

  const [aggr] = await Conversation.aggregate([
    { $match: { participantIds: caller.id, hiddenByUserIds: { $ne: caller.id } } },
    {
      $addFields: {
        _pinnedForMe: {
          $cond: [
            { $in: [caller.id, { $ifNull: ['$pinnedByUserIds', []] }] },
            1,
            0,
          ],
        },
        _sortDate: { $ifNull: ['$lastMessageAt', '$createdAt'] },
      },
    },
    { $sort: { _pinnedForMe: -1, _sortDate: -1 } },
    {
      $project: {
        type: 1,
        participantIds: 1,
        members: 1,
        name: 1,
        avatar: 1,
        mutedUserIds: 1,
        lastMessage: 1,
        lastMessageAt: 1,
        lastSenderId: 1,
        pinnedMessageId: 1,
        createdAt: 1,
        lastReadAt: 1,
        pinnedByUserIds: 1,
        mutedConversationByUserIds: 1,
      },
    },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: pageSize }],
        total: [{ $count: 'value' }],
      },
    },
  ])

  const conversations = (aggr?.items ?? []) as TConversationSource[]
  const total = Number(aggr?.total?.[0]?.value ?? 0)
  const hasMore = skip + conversations.length < total

  const directParticipantIds = collectDirectParticipantIds(conversations)
  const directNames = await resolveDirectMemberNames(directParticipantIds)

  const unreadOrs = conversations.map((conv) => {
    const lastReadAt =
      conv.lastReadAt instanceof Map
        ? Object.fromEntries(conv.lastReadAt.entries())
        : (conv.lastReadAt ?? {})
    const lastReadForCaller = lastReadAt[caller.id] ?? conv.createdAt
    return {
      conversationId: String(conv._id),
      senderId: { $ne: caller.id },
      deletedForUserIds: { $ne: caller.id },
      createdAt: { $gt: new Date(lastReadForCaller) },
    }
  })

  const unreadRows = unreadOrs.length
    ? ((await Message.aggregate([
        { $match: { $or: unreadOrs } },
        { $group: { _id: '$conversationId', unreadCount: { $sum: 1 } } },
      ])) as Array<{ _id: string; unreadCount: number }>)
    : []

  const unreadByConversation = new Map(unreadRows.map((row) => [String(row._id), row.unreadCount]))

  const views = await Promise.all(
    conversations.map(async (conv) => {
      const view = toConversationView(conv)
      if (view.type === 'direct') {
        return {
          ...withDirectConversationMembers(view, directNames),
          unreadCount: unreadByConversation.get(String(conv._id)) ?? 0,
          pinned: (conv.pinnedByUserIds ?? []).includes(caller.id),
          mutedForMe: (conv.mutedConversationByUserIds ?? []).includes(caller.id),
          myGroupMute: null,
        }
      }

      view.members = view.members.map((member) => {
        const status = resolveMemberMuteStatus(conv, member.userId)
        return status.muted
          ? {
              ...member,
              muteUntilAt: status.untilAtMs === null ? null : new Date(status.untilAtMs).toISOString(),
            }
          : member
      })

      const myMuteStatus = resolveMemberMuteStatus(conv, caller.id)
      return {
        ...view,
        unreadCount: unreadByConversation.get(String(conv._id)) ?? 0,
        pinned: (conv.pinnedByUserIds ?? []).includes(caller.id),
        mutedForMe: (conv.mutedConversationByUserIds ?? []).includes(caller.id),
        myGroupMute: myMuteStatus.muted
          ? { untilAt: myMuteStatus.untilAtMs === null ? null : new Date(myMuteStatus.untilAtMs).toISOString() }
          : null,
      }
    })
  )

  return {
    ok: true,
    conversations: views,
    total,
    page,
    pageSize,
    hasMore,
  }
}
